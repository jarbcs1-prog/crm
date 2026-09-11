import { PRIORITY } from "@crm/db/agent-tasks";
import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { scheduleTask } from "../lib/tasks";

interface CallScheduleResult {
	contactId: string;
	scheduled: boolean;
	reason?: string;
	dueAt?: string;
}

export default defineTool({
	description:
		"Schedules outbound pitch calls for a batch of contacts, skipping any without a phone number and any already queued for a call.",
	inputSchema: z.object({
		contactIds: z.array(z.string().min(1)).min(1).describe("The contacts to schedule calls for."),
		dueAt: z.string().optional().describe("ISO timestamp for when the calls should happen; defaults to fifteen minutes from now."),
		reason: z.string().optional().describe("Why these calls are being scheduled."),
	}),
	async execute({ contactIds, dueAt, reason }) {
		const results: CallScheduleResult[] = [];

		for (const contactId of contactIds) {
			const contact = await db.contact.findUnique({
				where: { id: contactId },
				select: { id: true, phone: true },
			});
			if (!contact) {
				results.push({ contactId, scheduled: false, reason: "No such contact." });
				continue;
			}
			if (!contact.phone) {
				results.push({ contactId, scheduled: false, reason: "This contact has no phone number on file." });
				continue;
			}

			let parsedDueAt: Date;
			if (dueAt) {
				const parsed = new Date(dueAt);
				if (Number.isNaN(parsed.getTime())) {
					results.push({ contactId, scheduled: false, reason: `Not a valid dueAt: ${dueAt}` });
					continue;
				}
				parsedDueAt = parsed;
			} else {
				parsedDueAt = new Date(Date.now() + 15 * 60_000);
			}

			try {
				await scheduleTask({
					contactId,
					kind: "call",
					reason: reason ?? "CLID pitch call",
					dueAt: parsedDueAt,
					budget: 5,
					priority: PRIORITY.call,
				});
				results.push({ contactId, scheduled: true, dueAt: parsedDueAt.toISOString() });
			} catch (error) {
				results.push({ contactId, scheduled: false, reason: String(error) });
			}
		}

		return {
			scheduled: results.filter((result) => result.scheduled).length,
			results,
		};
	},
});
