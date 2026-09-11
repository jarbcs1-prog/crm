import { CallDirection, CallEventType, CallStatus, db, evaluateOsintRequirement } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { focusOn } from "../lib/focus";
import { callerId, isVoiceConfigured, makeCall as placeCall } from "../lib/voice";

export default defineTool({
	description:
		"Places an outbound live call to a contact through the voice provider, records the call in the CRM, and hands the line to whoever answers.",
	inputSchema: z.object({
		contactId: z.string().min(1).describe("The contact to call."),
		phone: z.string().optional().describe("A phone number to call instead of the one on file."),
		requiresOsintCheck: z.boolean().optional().describe("Whether to check viability before calling."),
	}),
	async execute({ contactId, phone, requiresOsintCheck = true }) {
		if (!isVoiceConfigured()) {
			return { ok: false as const, reason: "Voice calling is not configured: VOIPSTUDIO_API_KEY is missing." };
		}

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { id: true, firstName: true, lastName: true, phone: true, ownerId: true, companyId: true },
		});
		if (!contact) return { ok: false as const, reason: "No such contact." };

		const number = phone?.trim() || contact.phone;
		if (!number) return { ok: false as const, reason: "This contact has no phone number on file." };

		if (requiresOsintCheck) {
			const osintFlag = evaluateOsintRequirement({
				id: contact.id,
				phone: contact.phone,
				email: null,
				firstName: contact.firstName,
				lastName: contact.lastName,
			});

			if (osintFlag.needsOsint) {
				return {
					ok: false as const,
					reason: `Contact viability score ${osintFlag.currentScore} below threshold. ${osintFlag.reason}`,
					needsOsint: true,
					viabilityReason: osintFlag.reason,
				};
			}
		}

		const user = contact.ownerId
			? await db.user.findUnique({ where: { id: contact.ownerId }, select: { id: true } })
			: await db.user.findFirst({ select: { id: true } });
		if (!user) return { ok: false as const, reason: "No user to attach the call to." };

		const call = await db.call.create({
			data: {
				contactId: contact.id,
				companyId: contact.companyId,
				userId: user.id,
				direction: CallDirection.OUTBOUND,
				status: CallStatus.QUEUED,
				calleeNumber: number,
			},
			select: { id: true },
		});

		let sipCallId: string;
		try {
			const placed = await placeCall({ to: number, callerId: callerId() });
			sipCallId = placed.id;
		} catch (error) {
			const reason = `Could not start the call: ${String(error)}`;
			await db.call.update({
				where: { id: call.id },
				data: { status: CallStatus.FAILED, endedAt: new Date(), meta: { error: reason } },
			});
			await db.callEvent.create({
				data: { callId: call.id, type: CallEventType.SIP_ERROR, payload: { error: reason } },
			});
			return { ok: false as const, reason };
		}

		await db.call.update({
			where: { id: call.id },
			data: { status: CallStatus.RINGING, sipCallId, startedAt: new Date() },
		});
		await db.callEvent.create({
			data: { callId: call.id, type: CallEventType.RING, payload: { sipCallId } },
		});
		await focusOn({ contactId: contact.id });

		return {
			ok: true as const,
			callId: call.id,
			sipCallId,
			number,
			pitchHint: "Lead with who you are and which company you represent, then deliver the CLID pitch.",
		};
	},
});
