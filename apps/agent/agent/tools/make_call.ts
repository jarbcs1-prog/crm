import {
	CallDirection,
	CallEventType,
	CallStatus,
	db,
	evaluateOsintRequirement,
} from "@crm/db";
import { readVoiceProviderState, VOICE_PROVIDERS } from "@crm/db/settings";
import { z } from "zod";
import { selectDialer } from "../lib/dialer";
import { focusOn } from "../lib/focus";
import { normalizeToE164 } from "../lib/phone";
import { CallSession } from "../lib/telephony/session";
import { createCallTool } from "../lib/tool-factory";

export default createCallTool({
	description:
		"Places an outbound call to a contact through Nonoh SIP, VoIP Studio, Twilio, Plivo or Vapi. Without an explicit provider, uses the human-selected default when set and otherwise the first configured provider. Nonoh keeps a local live session; hosted providers queue the call and report provider events asynchronously.",
	inputSchema: z.object({
		contactId: z.string().min(1).describe("The contact to call."),
		phone: z
			.string()
			.optional()
			.describe("A phone number to call instead of the one on file."),
		provider: z
			.enum(VOICE_PROVIDERS)
			.optional()
			.describe(
				"Optional provider override; otherwise use the human-selected default.",
			),
		assistant: z
			.unknown()
			.optional()
			.describe(
				"Optional hosted-provider assistant, such as the Vapi object returned by load_pitch.",
			),
		requiresOsintCheck: z
			.boolean()
			.optional()
			.describe("Whether to check viability before calling."),
	}),
	async execute({
		contactId,
		phone,
		provider,
		assistant,
		requiresOsintCheck = true,
	}) {
		const persistedProvider = await readVoiceProviderState(db);
		if (!persistedProvider.valid) {
			return {
				ok: false as const,
				reason:
					"The saved voice provider is invalid. Choose a valid provider in Settings before calling.",
			};
		}
		const selectedProvider = provider ?? persistedProvider.selectedId;
		const dialer = selectDialer(selectedProvider);
		if (!dialer) {
			return {
				ok: false as const,
				reason: selectedProvider
					? `Voice provider ${selectedProvider} is selected but not configured. Complete its environment settings or choose another provider.`
					: "Voice calling is not configured. Set Nonoh SIP, VoIP Studio, Twilio, Plivo or Vapi settings in the root environment.",
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

		const rawNumber = phone?.trim() || contact.phone;
		if (!rawNumber)
			return {
				ok: false as const,
				reason: "This contact has no phone number on file.",
			};

		const number = normalizeToE164(rawNumber);
		if (!number)
			return {
				ok: false as const,
				reason: `Not a valid E.164 number: ${rawNumber}. Expected +<country><number>, e.g. +15551234567.`,
				outcome: "INVALID_NUMBER",
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

		const dialed =
			dialer.name === "nonoh"
				? await CallSession.dial(number, { key: call.id }).then((result) =>
						result.ok && result.session
							? {
									ok: true as const,
									providerCallId: result.session.sipCallId,
									session: result.session,
								}
							: {
									ok: false as const,
									status: result.status,
									reason: result.reason ?? "The call could not be placed.",
								},
					)
				: await dialer.placeCall(number, { assistant });

		if (!dialed.ok || !dialed.providerCallId) {
			const reason = dialed.reason ?? "The call could not be placed.";
			const now = new Date();

			await db.call.update({
				where: { id: call.id },
				data: {
					status: CallStatus.FAILED,
					endedAt: now,
					meta: {
						provider: dialer.name,
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
						provider: dialer.name,
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
				provider: dialer.name,
				status: CallStatus.FAILED,
				...(dialed.status === undefined ? {} : { sipStatus: dialed.status }),
				reason,
			};
		}

		if (dialer.name !== "nonoh" || !("session" in dialed)) {
			const now = new Date();
			const note =
				"note" in dialed && typeof dialed.note === "string"
					? dialed.note
					: undefined;
			await db.call.update({
				where: { id: call.id },
				data: {
					sipCallId: dialed.providerCallId,
					startedAt: now,
					meta: { provider: dialer.name },
				},
			});
			await db.callEvent.create({
				data: {
					callId: call.id,
					type: CallEventType.RING,
					payload: {
						provider: dialer.name,
						providerCallId: dialed.providerCallId,
					},
				},
			});
			await focusOn({ contactId: contact.id });

			return {
				ok: true as const,
				callId: call.id,
				provider: dialer.name,
				providerCallId: dialed.providerCallId,
				number,
				status: CallStatus.QUEUED,
				queued: true as const,
				note:
					note ??
					"Queued via the configured provider; provider events update the CRM asynchronously.",
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
				meta: { provider: dialer.name },
			},
		});
		await db.callEvent.create({
			data: {
				callId: call.id,
				type: CallEventType.ANSWER,
				payload: { provider: dialer.name, sipCallId, sipStatus: 200 },
			},
		});
		await focusOn({ contactId: contact.id });

		return {
			ok: true as const,
			callId: call.id,
			provider: dialer.name,
			sipCallId,
			number,
			status: CallStatus.IN_PROGRESS,
			answered: true as const,
			pitchHint:
				"Identify yourself and the company truthfully, then use the voice-ai-cold-calling-research-first skill. Speak one short sentence, then listen; the line is half-duplex and cannot be interrupted.",
		};
	},
});
