import { z } from "zod";
import { scheduleTask } from "../lib/tasks";
import { defineTool } from "../lib/tool-factory";

export async function createTicket(input: {
	contactId?: string;
	companyId?: string;
	kind: string;
	reason: string;
	dueAt?: string;
	priority?: number;
	budget?: number;
}) {
	const dueAt = input.dueAt ? new Date(input.dueAt) : new Date();

	const result = await scheduleTask({
		contactId: input.contactId ?? null,
		companyId: input.companyId ?? null,
		kind: input.kind,
		reason: input.reason,
		dueAt,
		priority: input.priority ?? 0,
		budget: input.budget ?? 4,
	});

	return {
		ok: true as const,
		taskId: result.id,
		message: `Created ${input.kind} ticket for ${input.contactId ? `contact ${input.contactId}` : input.companyId ? `company ${input.companyId}` : "general"}`,
	};
}

export default defineTool({
	description:
		"Creates an AgentTask ticket for follow-up, enrichment, or any agent work. Links to a contact or company. Use when a call fails due to missing contact details, when OSINT is needed, or when a follow-up is required.",
	inputSchema: z.object({
		contactId: z
			.string()
			.optional()
			.describe("Contact ID to link the ticket to."),
		companyId: z
			.string()
			.optional()
			.describe("Company ID to link the ticket to."),
		kind: z
			.string()
			.min(1)
			.describe(
				"Ticket kind (e.g., 'osint-enrichment', 'missing-phone', 'missing-email', 'follow-up-call', 'update-contact').",
			),
		reason: z
			.string()
			.min(1)
			.describe("Human-readable reason for creating this ticket."),
		dueAt: z
			.string()
			.optional()
			.describe("When the ticket is due (ISO string). Defaults to now."),
		priority: z
			.number()
			.int()
			.default(0)
			.describe("Priority (higher = more urgent)."),
		budget: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(4)
			.describe("Budget for the task (1-10)."),
	}),
	async execute(input: {
		contactId?: string;
		companyId?: string;
		kind: string;
		reason: string;
		dueAt?: string;
		priority?: number;
		budget?: number;
	}) {
		return createTicket(input);
	},
});
