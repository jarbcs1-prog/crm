import { CallEventType, CallStatus, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callCode, getCall, isTerminalStatus } from "../lib/voice";

export default defineTool({
	description:
		"Reports the current status of a call in plain English, asking the voice provider when the call is not already terminal and persisting what the provider says.",
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
				codephrase = `Could not reach the provider (${String(error)}); leaving the CRM status as ${call.status.toLowerCase()}.`;
			}
		}

		return { ok: true as const, final: false as const, status, codephrase };
	},
});
