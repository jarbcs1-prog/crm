import { CallEventType, CallStatus, db } from "@crm/db";
import { z } from "zod";
import { providerFromMeta, providerStatus } from "../lib/dialer";
import { getSession } from "../lib/telephony/session";
import { defineTool } from "../lib/tool-factory";
import { isTerminalStatus } from "../lib/voice";

export default defineTool({
	description:
		"Reports the current status of a call in plain English. A live Nonoh session is reported from its own RTP and SIP state; hosted status is queried from the provider recorded on the call and normalized into the CRM status vocabulary.",
	inputSchema: z.object({
		callId: z.string().min(1).describe("The CRM id of the call to check."),
	}),
	async execute({ callId }) {
		const call = await db.call.findUnique({
			where: { id: callId },
			select: {
				id: true,
				status: true,
				sipCallId: true,
				meta: true,
				startedAt: true,
				answeredAt: true,
			},
		});
		if (!call) return { ok: false as const, reason: "No such call." };
		const provider = providerFromMeta(call.meta);

		if (isTerminalStatus(call.status)) {
			return {
				ok: true as const,
				final: true as const,
				status: call.status,
				codephrase: `The call already ended as ${call.status}.`,
			};
		}

		let status: CallStatus = call.status;
		let codephrase = `The call is ${call.status.toLowerCase()} according to the CRM.`;

		const session =
			getSession(callId) ??
			(call.sipCallId ? getSession(call.sipCallId) : undefined);

		if (session) {
			const stats = session.stats;
			const live = !session.hasEnded;

			if (live && call.status !== CallStatus.IN_PROGRESS) {
				const now = new Date();
				await db.call.update({
					where: { id: call.id },
					data: {
						status: CallStatus.IN_PROGRESS,
						answeredAt: call.answeredAt ?? now,
					},
				});
				await db.callEvent.create({
					data: { callId: call.id, type: CallEventType.ANSWER },
				});
				status = CallStatus.IN_PROGRESS;
			}

			codephrase = live
				? `The call is live on Nonoh (SIP 200, media flowing): ${stats.rxPackets} packets received${
						stats.rxSource ? ` from ${stats.rxSource}` : ""
					}, ${stats.txPackets} sent, inbound peak amplitude ${stats.peak}.`
				: "The SIP session for this call has ended; no media is flowing.";

			return {
				ok: true as const,
				final: isTerminalStatus(status),
				status,
				live,
				codephrase,
				stats,
			};
		}

		codephrase = `The call is ${call.status.toLowerCase()} according to the CRM and there is no live Nonoh session for it.`;

		if (call.sipCallId && !provider) {
			return {
				ok: false as const,
				reason:
					"Call has no valid provider metadata; refusing to guess its status.",
			};
		}

		if (call.sipCallId && provider) {
			const providerResult = await providerStatus(provider, call.sipCallId);
			if (!providerResult.ok) {
				codephrase =
					providerResult.reason ?? "The provider status is unavailable.";
			} else if (providerResult.code) {
				status = providerResult.code.status;
				codephrase = providerResult.code.codephrase;

				if (status !== call.status) {
					const now = new Date();
					if (status === CallStatus.IN_PROGRESS) {
						await db.call.update({
							where: { id: call.id },
							data: { status, answeredAt: now },
						});
						await db.callEvent.create({
							data: { callId: call.id, type: CallEventType.ANSWER },
						});
					} else if (isTerminalStatus(status)) {
						const anchor = call.answeredAt ?? call.startedAt;
						const durationSecs = anchor
							? Math.max(
									0,
									Math.round((now.getTime() - anchor.getTime()) / 1000),
								)
							: null;
						await db.call.update({
							where: { id: call.id },
							data: { status, endedAt: now, durationSecs },
						});
						await db.callEvent.create({
							data: { callId: call.id, type: CallEventType.HANGUP },
						});
					}
				}
			}
		}

		return {
			ok: true as const,
			final: isTerminalStatus(status),
			status,
			codephrase,
		};
	},
});
