import { CallEventType, CallStatus, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { hangup, isTerminalStatus } from "../lib/voice";

export default defineTool({
	description:
		"Ends a call that is still ringing or live: hangs up at the provider when a SIP call id exists, marks the call cancelled, and records a hang-up event. Safe to call twice.",
	inputSchema: z.object({
		callId: z.string().min(1).describe("The CRM id of the call to end."),
	}),
	async execute({ callId }) {
		const call = await db.call.findUnique({
			where: { id: callId },
			select: {
				id: true,
				status: true,
				sipCallId: true,
				startedAt: true,
				answeredAt: true,
			},
		});
		if (!call) return { ok: false as const, reason: "No such call." };

		if (isTerminalStatus(call.status)) {
			return {
				ok: false as const,
				alreadyEnded: true as const,
				status: call.status,
			};
		}

		let hangupError: string | null = null;
		if (call.sipCallId) {
			try {
				await hangup(call.sipCallId);
			} catch (error) {
				hangupError = String(error);
			}
		}

		const now = new Date();
		const anchor = call.answeredAt ?? call.startedAt;
		const durationSecs = anchor
			? Math.max(0, Math.round((now.getTime() - anchor.getTime()) / 1000))
			: null;

		await db.call.update({
			where: { id: call.id },
			data: { status: CallStatus.CANCELLED, endedAt: now, durationSecs },
		});
		await db.callEvent.create({
			data: {
				callId: call.id,
				type: CallEventType.HANGUP,
				payload: { hangupError },
			},
		});

		return {
			ok: true as const,
			ended: true as const,
			status: CallStatus.CANCELLED,
			hangupError,
			durationSecs,
		};
	},
});
