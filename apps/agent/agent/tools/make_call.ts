import {
	CallDirection,
	CallEventType,
	CallStatus,
	db,
	evaluateOsintRequirement,
} from "@crm/db";
import { z } from "zod";
import { createCallTool } from "./tool-factory";
import { focusOn } from "../lib/focus";
import { CallSession } from "../lib/telephony/session";
import { isNonohConfigured } from "../lib/voice";

export default createCallTool({
	description:
		"Places an outbound live call to a contact over the Nonoh SIP trunk, records the call in the CRM and keeps the line open so speak_on_call and listen_on_call can hold the conversation. Returns only after the far end answers with SIP 200; a ringing line that never answers is a failure, not a connection.",
	inputSchema: z.object({
		contactId: z.string().min(1).describe("The contact to call."),
		phone: z
			.string()
			.optional()
			.describe("A phone number to call instead of the one on file."),
		requiresOsintCheck: z
			.boolean()
			.optional()
			.describe("Whether to check viability before calling."),
	}),
	async execute({ contactId, phone, requiresOsintCheck = true }) {
		if (!isNonohConfigured()) {
			return {
				ok: false as const,
				reason:
					"Voice calling is not configured: NONOH_SIP_SERVER, NONOH_USERNAME and NONOH_PASSWORD are all required.",
			};
		}

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				phone: true,
				ownerId: true,
				companyId: true,
			},
		});
		if (!contact) return { ok: false as const, reason: "No such contact." };

		const number = phone?.trim() || contact.phone;
		if (!number)
			return {
				ok: false as const,
				reason: "This contact has no phone number on file.",
			};

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
			? await db.user.findUnique({
					where: { id: contact.ownerId },
					select: { id: true },
				})
			: await db.user.findFirst({ select: { id: true } });
		if (!user)
			return { ok: false as const, reason: "No user to attach the call to." };

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

		const dialed = await CallSession.dial(number, { key: call.id });

		if (!dialed.ok || !dialed.session) {
			const reason = dialed.reason ?? "The call could not be placed.";
			const now = new Date();

			await db.call.update({
				where: { id: call.id },
				data: {
					status: CallStatus.FAILED,
					endedAt: now,
					meta: {
						error: reason,
						...(dialed.status === undefined
							? {}
							: { sipStatus: dialed.status }),
					},
				},
			});
			await db.callEvent.create({
				data: {
					callId: call.id,
					type: CallEventType.SIP_ERROR,
					payload: {
						error: reason,
						...(dialed.status === undefined
							? {}
							: { sipStatus: dialed.status }),
					},
				},
			});

			return {
				ok: false as const,
				callId: call.id,
				number,
				status: CallStatus.FAILED,
				...(dialed.status === undefined ? {} : { sipStatus: dialed.status }),
				reason,
			};
		}

		const session = dialed.session;
		const sipCallId = session.sipCallId;
		const now = new Date();

		await db.call.update({
			where: { id: call.id },
			data: {
				status: CallStatus.IN_PROGRESS,
				sipCallId,
				startedAt: now,
				answeredAt: now,
			},
		});
		await db.callEvent.create({
			data: {
				callId: call.id,
				type: CallEventType.ANSWER,
				payload: { sipCallId, sipStatus: 200 },
			},
		});
		await focusOn({ contactId: contact.id });

		return {
			ok: true as const,
			callId: call.id,
			sipCallId,
			number,
			status: CallStatus.IN_PROGRESS,
			answered: true as const,
			pitchHint:
				"Lead with who you are and which company you represent, then qualify them using the legal approach script. Speak a short sentence, then listen; the line is half-duplex and cannot be interrupted.",
		};
	},
});
