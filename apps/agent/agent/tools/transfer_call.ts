import { CallEventType, CallStatus, db } from "@crm/db";
import { z } from "zod";
import { providerFromMeta } from "../lib/dialer";
import { defineTool } from "../lib/tool-factory";
import { transfer } from "../lib/voice";

export default defineTool({
	description:
		"Transfers a live call to another destination (extension, phone number, or user). Records a TRANSFER event in the CRM.",
	inputSchema: z.object({
		callId: z.string().min(1).describe("The CRM id of the call to transfer."),
		destination: z
			.string()
			.min(1)
			.describe(
				"The extension, phone number, or user to transfer the call to.",
			),
	}),
	async execute({ callId, destination }) {
		const call = await db.call.findUnique({
			where: { id: callId },
			select: { id: true, status: true, sipCallId: true, meta: true },
		});
		if (!call) return { ok: false as const, reason: "No such call." };
		if (providerFromMeta(call.meta) !== "voipstudio") {
			return {
				ok: false as const,
				reason: "Transferring is supported only for VoIP Studio calls.",
			};
		}

		if (
			call.status !== CallStatus.IN_PROGRESS &&
			call.status !== CallStatus.RINGING
		) {
			return {
				ok: false as const,
				reason: `Call is ${call.status.toLowerCase()} and cannot be transferred.`,
			};
		}

		if (!call.sipCallId) {
			return { ok: false as const, reason: "Call has no SIP call id." };
		}

		try {
			await transfer(call.sipCallId, destination);
		} catch (error) {
			return { ok: false as const, reason: String(error) };
		}

		await db.callEvent.create({
			data: {
				callId: call.id,
				type: CallEventType.TRANSFER,
				payload: { destination },
			},
		});

		return {
			ok: true as const,
			callId: call.id,
			sipCallId: call.sipCallId,
			destination,
		};
	},
});
