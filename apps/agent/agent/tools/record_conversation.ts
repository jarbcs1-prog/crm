import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { writeTimelineNote } from "../lib/crm";
import { scheduleTask } from "../lib/tasks";

export async function recordConversation(
	input: {
		contactId: string;
		summary: string;
		outcome?: string;
		createFollowUpTicket?: boolean;
		followUpReason?: string;
	},
) {
	const { contactId, summary, outcome, createFollowUpTicket, followUpReason } =
		input;

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { id: true, firstName: true, lastName: true },
	});

	if (!contact) {
		return { ok: false as const, reason: "No such contact." };
	}

	await writeTimelineNote(
		contactId,
		outcome ? `Conversation outcome: ${outcome}` : "Conversation recorded",
		summary,
		{ summary, outcome },
	);

	let ticketId: string | null = null;

	if (createFollowUpTicket) {
		if (!followUpReason) {
			return {
				ok: false as const,
				reason: "followUpReason is required when createFollowUpTicket is true.",
			};
		}

		const task = await scheduleTask({
			contactId,
			kind: "recheck",
			reason: followUpReason,
			dueAt: new Date(),
			priority: PRIORITY.recheck,
			budget: 4,
		});
		ticketId = task.id;
	}

	return {
		ok: true as const,
		contactId,
		summary,
		outcome,
		ticketId,
	};
}

export default defineTool({
	description:
		"Records a conversation summary for a contact, optionally creating a follow-up ticket. Use after a call or meeting to persist what was discussed.",
	inputSchema: z.object({
		contactId: z.string().min(1).describe("The contact whose conversation is being recorded."),
		summary: z.string().min(1).describe("What was discussed in the conversation."),
		outcome: z.string().optional().describe("The outcome of the conversation (e.g., 'interested', 'not interested', 'callback requested')."),
		createFollowUpTicket: z.boolean().default(false).describe("Whether to create a follow-up ticket."),
		followUpReason: z.string().optional().describe("Reason for the follow-up ticket, required if createFollowUpTicket is true."),
	}),
	async execute(input: {
		contactId: string;
		summary: string;
		outcome?: string;
		createFollowUpTicket?: boolean;
		followUpReason?: string;
	}) {
		return recordConversation(input);
	},
});