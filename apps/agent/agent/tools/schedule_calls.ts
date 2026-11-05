import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { z } from "zod";
import { normalizeToE164 } from "../lib/phone";
import { scheduleTask } from "../lib/tasks";
import { defineTool } from "../lib/tool-factory";

interface CallScheduleResult {
	contactId: string;
	scheduled: boolean;
	reason?: string;
	dueAt?: string;
}

export const SCHEDULE_BATCH_CAP = 60;

export default defineTool({
	description:
		"Schedules outbound pitch calls for a batch of contacts, skipping any without a phone number and any already queued for a call. At most 60 contacts are scheduled per call; pass bulk to queue them as a bulk batch that never delays higher-priority work.",
	inputSchema: z.object({
		contactIds: z
			.array(z.string().min(1))
			.min(1)
			.describe("The contacts to schedule calls for."),
		dueAt: z
			.string()
			.optional()
			.describe(
				"ISO timestamp for when the calls should happen; defaults to fifteen minutes from now.",
			),
		reason: z
			.string()
			.optional()
			.describe("Why these calls are being scheduled."),
		bulk: z
			.boolean()
			.optional()
			.describe(
				"Queue as a bulk batch (voice-batch kind, below requested priority) instead of single calls, so a large batch never delays higher-priority work.",
			),
	}),
	async execute({ contactIds, dueAt, reason, bulk }) {
		const results: CallScheduleResult[] = [];
		const kind = bulk ? "voice-batch" : "call";
		const priority = bulk ? PRIORITY.voiceBatch : PRIORITY.call;

		const capped = contactIds.slice(0, SCHEDULE_BATCH_CAP);
		const skippedByCap = contactIds.length - capped.length;

		for (const contactId of capped) {
			const contact = await db.contact.findUnique({
				where: { id: contactId },
				select: { id: true, phone: true },
			});
			if (!contact) {
				results.push({
					contactId,
					scheduled: false,
					reason: "No such contact.",
				});
				continue;
			}
			if (!contact.phone) {
				results.push({
					contactId,
					scheduled: false,
					reason: "This contact has no phone number on file.",
				});
				continue;
			}

			if (!normalizeToE164(contact.phone)) {
				results.push({
					contactId,
					scheduled: false,
					reason:
						"This contact's phone number is not a valid E.164 number (expected +<country><number>, e.g. +15551234567).",
				});
				continue;
			}

			let parsedDueAt: Date;
			if (dueAt) {
				const parsed = new Date(dueAt);
				if (Number.isNaN(parsed.getTime())) {
					results.push({
						contactId,
						scheduled: false,
						reason: `Not a valid dueAt: ${dueAt}`,
					});
					continue;
				}
				parsedDueAt = parsed;
			} else {
				parsedDueAt = new Date(Date.now() + 15 * 60_000);
			}

			try {
				await scheduleTask({
					contactId,
					kind,
					reason:
						reason ??
						"Use the voice-ai-cold-calling-research-first skill, load pitch research-first-cold-call-v1 with verified company_name and call_purpose values, pass its refusalBranches and consentRules to listen_on_call, and record the observed outcome with the typed voice tools.",
					dueAt: parsedDueAt,
					budget: 5,
					priority,
				});
				results.push({
					contactId,
					scheduled: true,
					dueAt: parsedDueAt.toISOString(),
				});
			} catch (error) {
				results.push({ contactId, scheduled: false, reason: String(error) });
			}
		}

		return {
			scheduled: results.filter((result) => result.scheduled).length,
			kind,
			...(skippedByCap > 0
				? {
						capped: true as const,
						cap: SCHEDULE_BATCH_CAP,
						skipped: skippedByCap,
						capNote: `Only the first ${SCHEDULE_BATCH_CAP} contacts were scheduled; ${skippedByCap} were left out. Schedule them in a follow-up batch.`,
					}
				: {}),
			results,
		};
	},
});
