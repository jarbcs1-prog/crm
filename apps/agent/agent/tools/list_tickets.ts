import { db } from "@crm/db";
import { defineTool } from "./tool-factory";
import { z } from "zod";

export async function listTickets(
	input: {
		limit?: number;
		kind?: string;
		contactId?: string;
		companyId?: string;
	},
) {
	const { limit = 50, kind, contactId, companyId } = input;

	const where: any = { finishedAt: null };
	if (kind) where.kind = { equals: kind };
	if (contactId) where.contactId = { equals: contactId };
	if (companyId) where.companyId = { equals: companyId };

	const rows = await db.agentTask.findMany({
		where,
		orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
		take: limit,
		select: {
			id: true,
			contactId: true,
			companyId: true,
			kind: true,
			reason: true,
			priority: true,
			budget: true,
			attempts: true,
			dueAt: true,
		},
	});

	return {
		count: rows.length,
		tickets: rows.map((row) => ({
			id: row.id,
			contactId: row.contactId,
			companyId: row.companyId,
			kind: row.kind,
			reason: row.reason,
			priority: row.priority,
			budget: row.budget,
			attempts: row.attempts,
			dueAt: row.dueAt.toISOString(),
		})),
	};
}

export default defineTool({
	description:
		"Lists outstanding AgentTask tickets, optionally filtered by kind, contact, or company. Use when an enrichment agent needs to find work to do.",
	inputSchema: z.object({
		limit: z
			.number()
			.int()
			.min(1)
			.max(100)
			.default(50)
			.describe("Maximum number of tickets to return."),
		kind: z
			.string()
			.optional()
			.describe("Filter by ticket kind (e.g., 'osint-enrichment', 'missing-phone')."),
		contactId: z
			.string()
			.optional()
			.describe("Filter by contact ID."),
		companyId: z
			.string()
			.optional()
			.describe("Filter by company ID."),
	}),
	async execute(input: {
		limit?: number;
		kind?: string;
		contactId?: string;
		companyId?: string;
	}) {
		return listTickets(input);
	},
});