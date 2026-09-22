import { CallEventType, CallStatus, db } from "@crm/db";
import { defineTool } from "./tool-factory";
import { z } from "zod";
import { getSession } from "../lib/telephony/session";
import { callCode, getCall, isTerminalStatus } from "../lib/voice";

export default defineTool({
	description:
		"Reports the current status of a call in plain English. A live Nonoh session is reported from its own RTP and SIP state; otherwise the voice provider is asked, when one is configured.",
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
				startedAt: true,
				answeredAt: true,
			},
		});
		if (!call) return { ok: false as const, reason: "No such call." };

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
				final: false as const,
				status,
				live,
				codephrase,
				stats,
			};
		}

		codephrase = `The call is ${call.status.toLowerCase()} according to the CRM and there is no live Nonoh session for it.`;

		if (call.sipCallId) {
			try {
				const provider = await getCall(call.sipCallId);
				const nested =
					typeof provider?.data === "object" && provider.data !== null
						? (provider.data as Record<string, unknown>)
						: undefined;
				const providerStatus = nested?.status ?? provider?.status;
				const providerCode =
					typeof nested?.code === "number"
						? nested.code
						: typeof provider?.code === "number"
							? provider.code
							: null;
				const mapped = callCode(
					providerStatus as string | number | undefined,
					providerCode,
				);

				status = mapped.status;
				codephrase = mapped.codephrase;

				if (mapped.status !== call.status) {
					const now = new Date();
					if (mapped.status === CallStatus.IN_PROGRESS) {
						await db.call.update({
							where: { id: call.id },
							data: { status: CallStatus.IN_PROGRESS, answeredAt: now },
						});
						await db.callEvent.create({
							data: { callId: call.id, type: CallEventType.ANSWER },
						});
					} else if (isTerminalStatus(mapped.status)) {
						const anchor = call.answeredAt ?? call.startedAt;
						const durationSecs = anchor
							? Math.max(
									0,
									Math.round((now.getTime() - anchor.getTime()) / 1000),
								)
							: null;
						await db.call.update({
							where: { id: call.id },
							data: { status: mapped.status, endedAt: now, durationSecs },
						});
						await db.callEvent.create({
							data: { callId: call.id, type: CallEventType.HANGUP },
						});
					}
				}
			} catch (error) {
				codephrase = `Could not reach the provider (${String(error)}) and there is no live session to report on; leaving the CRM status as ${call.status.toLowerCase()}.`;
			}
		}

		return { ok: true as const, final: false as const, status, codephrase };
	},
});
