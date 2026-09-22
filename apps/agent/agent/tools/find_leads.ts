import { db, Prisma } from "@crm/db";
import { z } from "zod";
import { defineTool } from "../lib/tool-factory";

export async function findLeads(input: {
	limit?: number;
	countries?: string[];
	regions?: string[];
	nameContains?: string;
	companyNameContains?: string;
	onlyWithEmail?: boolean;
	onlyWithPhone?: boolean;
	onlyWithCompany?: boolean;
	minActivityDays?: number;
	stockNames?: string[];
}) {
	const {
		limit = 50,
		countries = [],
		regions = [],
		nameContains = "",
		companyNameContains = "",
		onlyWithEmail = false,
		onlyWithPhone = false,
		onlyWithCompany = false,
		minActivityDays = 0,
		stockNames = [],
	} = input;

	const where: any = {};

	if (countries.length > 0) {
		where.country = { in: countries };
	}

	if (regions.length > 0) {
		where.countryCode = { in: regions };
	}

	if (onlyWithPhone) {
		where.phone = { not: null };
	}

	if (onlyWithEmail) {
		where.email = { not: null };
	}

	if (onlyWithCompany) {
		where.companyId = { not: null };
	}

	// minActivityDays: "Minimum days since last activity"
	// If set, lastActivityAt must be older than (now - minActivityDays)
	// i.e., the contact has NOT been active in the last minActivityDays days
	if (minActivityDays > 0) {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - minActivityDays);
		where.lastActivityAt = { lt: cutoff };
	}

	if (nameContains) {
		where.OR = [
			{ firstName: { contains: nameContains, mode: "insensitive" } },
			{ lastName: { contains: nameContains, mode: "insensitive" } },
		];
	}

	if (companyNameContains) {
		where.company = {
			name: { contains: companyNameContains, mode: "insensitive" },
		};
	}

	// Build base query
	let rows: any[];

	if (stockNames.length > 0) {
		// Query legacy tables to find contacts that own the specified stocks
		// Uses public.legacy_map to bridge crm_legacy.client_shares to current Contact IDs
		const stockRows = await db.$queryRaw<
			Array<{
				id: string;
				firstName: string | null;
				lastName: string | null;
				phone: string | null;
				email: string | null;
				country: string | null;
				countryCode: string | null;
				companyId: string | null;
				companyName: string | null;
				lastActivityAt: Date | null;
			}>
		>`
			SELECT DISTINCT lm."prismaContactId" as id, 
				c."firstName", 
				c."lastName", 
				c."phone", 
				c."email", 
				c."country", 
				c."countryCode", 
				c."companyId", 
				co."name" as companyName,
				c."lastActivityAt"
			FROM "crm_legacy"."client_shares" cs
			JOIN "crm_legacy"."stocks" s ON cs."id_stock" = s."id"
			JOIN public."legacy_map" lm ON lm."legacyTable" = 'clients' AND lm."legacyId" = cs."id_client"
			JOIN "contact" c ON c."id" = lm."prismaContactId"
			LEFT JOIN "company" co ON co.id = c."companyId"
			WHERE s."name" IN (${Prisma.join(stockNames)})
		`;

		// Apply non-stock filters to the stock results
		let filtered = stockRows;

		// Apply country filter
		if (countries.length > 0) {
			filtered = filtered.filter((row) =>
				countries.includes(row.country ?? ""),
			);
		}

		// Apply countryCode/region filter
		if (regions.length > 0) {
			filtered = filtered.filter((row) =>
				regions.includes(row.countryCode ?? ""),
			);
		}

		// Apply onlyWithPhone filter (NOT hard-coded anymore)
		if (onlyWithPhone) {
			filtered = filtered.filter((row) => row.phone !== null);
		}

		// Apply onlyWithEmail filter
		if (onlyWithEmail) {
			filtered = filtered.filter((row) => row.email !== null);
		}

		// Apply onlyWithCompany filter
		if (onlyWithCompany) {
			filtered = filtered.filter((row) => row.companyId !== null);
		}

		// Apply minActivityDays filter (last activity at least minActivityDays ago)
		// Already applied above via where clause, but need to also filter here since
		// the raw query doesn't support the lt operator in the same way
		if (minActivityDays > 0) {
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - minActivityDays);
			filtered = filtered.filter(
				(row) => row.lastActivityAt && row.lastActivityAt < cutoff,
			);
		}

		// Apply nameContains filter (case-insensitive)
		if (nameContains) {
			const lowerName = nameContains.toLowerCase();
			filtered = filtered.filter(
				(row) =>
					row.firstName?.toLowerCase().includes(lowerName) ||
					row.lastName?.toLowerCase().includes(lowerName) ||
					false,
			);
		}

		// Apply companyNameContains filter (case-insensitive)
		if (companyNameContains) {
			const lowerCompany = companyNameContains.toLowerCase();
			filtered = filtered.filter(
				(row) => row.companyName?.toLowerCase().includes(lowerCompany) || false,
			);
		}

		// Order by lastActivityAt DESC (most recently active first among stale leads)
		filtered.sort(
			(a, b) =>
				(b.lastActivityAt ?? new Date(0)).getTime() -
				(a.lastActivityAt ?? new Date(0)).getTime(),
		);

		rows = filtered.slice(0, limit);
	} else {
		rows = await db.contact.findMany({
			where,
			orderBy: [{ lastActivityAt: "desc" }, { createdAt: "asc" }],
			take: limit,
			select: {
				id: true,
				firstName: true,
				lastName: true,
				phone: true,
				email: true,
				country: true,
				countryCode: true,
				company: { select: { id: true, name: true, domain: true } },
				lastActivityAt: true,
			},
		});
	}

	return {
		count: rows.length,
		contacts: rows.map(
			(row: {
				id: string;
				firstName: string | null;
				lastName: string | null;
				phone: string | null;
				email: string | null;
				country: string | null;
				countryCode: string | null;
				company: { id: string; name: string; domain: string | null } | null;
				lastActivityAt: Date | null;
			}) => ({
				id: row.id,
				name: [row.firstName, row.lastName].filter(Boolean).join(" "),
				phone: row.phone,
				email: row.email,
				company: row.company,
				country: row.country,
				countryCode: row.countryCode,
				lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
			}),
		),
	};
}

export default defineTool({
	description:
		"Finds qualified leads based on multiple criteria: country/region, name, company, stock ownership, activity, and contact completeness. Use when a task asks for leads to call.",
	inputSchema: z.object({
		limit: z
			.number()
			.int()
			.min(1)
			.max(200)
			.default(50)
			.describe("Maximum number of leads to return."),
		countries: z
			.array(z.string())
			.optional()
			.describe(
				"Filter by country names or ISO country codes (e.g., ['US', 'GB', 'DE', 'Sweden']).",
			),
		regions: z
			.array(z.string())
			.optional()
			.describe(
				"Filter by country/region groupings (e.g., ['EU', 'NA', 'ASIA']).",
			),
		nameContains: z
			.string()
			.optional()
			.describe(
				"Filter contacts whose first or last name contains this text (case-insensitive).",
			),
		companyNameContains: z
			.string()
			.optional()
			.describe(
				"Filter contacts whose company name contains this text (case-insensitive).",
			),
		onlyWithEmail: z
			.boolean()
			.default(false)
			.describe("Only return contacts that have an email on file."),
		onlyWithPhone: z
			.boolean()
			.default(false)
			.describe("Only return contacts that have a phone on file."),
		onlyWithCompany: z
			.boolean()
			.default(false)
			.describe("Only return contacts that have a company assigned."),
		minActivityDays: z
			.number()
			.min(0)
			.default(0)
			.describe(
				"Minimum days since last activity. Contacts inactive for at least this many days will be included. Default 0 = no filter.",
			),
		stockNames: z
			.array(z.string())
			.optional()
			.describe(
				"Filter contacts who own shares in companies matching these stock names (e.g., ['Apple', 'Microsoft']).",
			),
	}),
	async execute(input: {
		limit?: number;
		countries?: string[];
		regions?: string[];
		nameContains?: string;
		companyNameContains?: string;
		onlyWithEmail?: boolean;
		onlyWithPhone?: boolean;
		onlyWithCompany?: boolean;
		minActivityDays?: number;
		stockNames?: string[];
	}) {
		return findLeads(input);
	},
});
