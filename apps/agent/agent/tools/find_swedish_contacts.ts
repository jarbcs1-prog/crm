import { db } from "@crm/db";
import { z } from "zod";
import { defineTool } from "./tool-factory";

export async function findSwedishContacts(
	input: { limit?: number; requirePhone?: boolean } = {},
) {
	const { limit = 20, requirePhone = true } = input;
	const rows = await db.contact.findMany({
		where: {
			country: { equals: "Sweden" },
			...(requirePhone ? { phone: { not: null } } : {}),
		},
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
		"Finds contacts whose country is Sweden, ordered by most recent activity. Use when a task asks for Swedish leads.",
	inputSchema: z.object({
		limit: z
			.number()
			.int()
			.min(1)
			.max(50)
			.default(20)
			.describe("Maximum number of Swedish contacts to return."),
		requirePhone: z
			.boolean()
			.default(true)
			.describe("Only return contacts that have a phone number on file."),
	}),
	async execute(input: { limit?: number; requirePhone?: boolean }) {
		return findSwedishContacts(input);
	},
});
