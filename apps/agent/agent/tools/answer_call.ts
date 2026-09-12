import { CallDirection, CallEventType, CallStatus, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { answer } from "../lib/voice";

export default defineTool({
	description:
		"Answers an inbound call that is currently ringing. Updates the CRM call status to IN_PROGRESS and records an ANSWER event.",
	inputSchema: z.object({
		callId: z
			.string()
			.min(1)
			.describe("The CRM id of the inbound call to answer."),
	}),
	async execute({ callId }) {
		const call = await db.call.findUnique({
			where: { id: callId },
			select: { id: true, direction: true, status: true, sipCallId: true },
		});
		if (!call) return { ok: false as const, reason: "No such call." };

		if (call.direction !== CallDirection.INBOUND) {
			return {
				ok: false as const,
				reason: "Only inbound calls can be answered.",
			};
		}

		if (call.status !== CallStatus.RINGING) {
			return {
				ok: false as const,
				reason: `Call is ${call.status.toLowerCase()}, not ringing.`,
			};
		}

		if (!call.sipCallId) {
			return { ok: false as const, reason: "Call has no provider identifier." };
		}

		await answer(call.sipCallId);

		await db.call.update({
			where: { id: call.id },
			data: { status: CallStatus.IN_PROGRESS, answeredAt: new Date() },
		});
		await db.callEvent.create({
			data: { callId: call.id, type: CallEventType.ANSWER },
		});

		return {
			ok: true as const,
			callId: call.id,
			sipCallId: call.sipCallId,
			status: CallStatus.IN_PROGRESS,
		};
	},
});
