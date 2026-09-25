import { CallEventType, CallStatus, db } from "@crm/db";
import { z } from "zod";
import { hangupCall, providerFromMeta } from "../lib/dialer";
import { getSession } from "../lib/telephony/session";
import { defineTool } from "../lib/tool-factory";
import { isTerminalStatus } from "../lib/voice";

export default defineTool({
	description:
		"Ends a call that is still live: sends a SIP BYE when the Nonoh session for it still exists, hangs up via the voice provider for hosted calls, and marks the call cancelled only after termination is confirmed. A failed or unidentifiable provider hangup remains retryable.",
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
				meta: true,
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

		const session =
			getSession(callId) ??
			(call.sipCallId ? getSession(call.sipCallId) : undefined);

		if (session) {
			try {
				await session.hangup();
			} catch (error) {
				return {
					ok: false as const,
					retryable: true as const,
					reason: `The provider hangup was not confirmed: ${String(error)}`,
				};
			}
		} else if (call.sipCallId) {
			const hung = await hangupCall(call.meta, call.sipCallId);
			if (!hung.ok) {
				return {
					ok: false as const,
					retryable: true as const,
					reason:
						hung.reason ??
						"The provider hangup was not confirmed; the call remains retryable.",
				};
			}
		} else {
			return {
				ok: false as const,
				retryable: true as const,
				reason:
					"No live session or provider call identifier exists; the call was not terminated.",
			};
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
				payload: { provider: providerFromMeta(call.meta) },
			},
		});

		return {
			ok: true as const,
			ended: true as const,
			status: CallStatus.CANCELLED,
			durationSecs,
		};
	},
});
