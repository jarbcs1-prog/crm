import { z } from "zod";
import { getSession } from "../lib/telephony/session";
import { createCallTool } from "./tool-factory";

export default createCallTool({
	description:
		"Speaks one short sentence into a live call that make_call answered. Wait for it to return before listening: the line is half-duplex, so audio played now cannot be interrupted. Returns spoken false with a reason when the call is gone instead of throwing. Document-request turns are gated: pass requiresDocumentConsent for any segment that asks for documents or financial information, and the turn is refused unless consentGranted is true from an explicit affirmative earlier in the call.",
	inputSchema: z.object({
		callId: z
			.string()
			.min(1)
			.describe("The CRM call id returned by make_call."),
		text: z
			.string()
			.min(1)
			.describe("What to say. Keep it to one short sentence."),
		requiresDocumentConsent: z
			.boolean()
			.optional()
			.describe(
				"Set it for segments that request documents or financial information. The turn is refused unless consentGranted is true.",
			),
		consentGranted: z
			.boolean()
			.optional()
			.describe(
				"Whether the caller gave an explicit affirmative to provide documents earlier in this call. Silence, ambiguity and recognition are never consent, so leave it false unless a clear yes was heard.",
			),
	}),
	async execute({ callId, text, requiresDocumentConsent, consentGranted }) {
		if (requiresDocumentConsent === true && consentGranted !== true) {
			return {
				spoken: false as const,
				reason:
					"Refused: this turn requests documents but no explicit consent was recorded for this call. Consent requires a clear affirmative; silence, ambiguity and recognition are never consent. Continue with verification or consent-seeking segments instead.",
			};
		}
		const session = getSession(callId);
		if (!session) {
			return {
				spoken: false as const,
				reason:
					"There is no live call with that id: it was never answered, or it has already ended.",
			};
		}
		if (session.hasEnded) {
			return {
				spoken: false as const,
				reason: "That call has ended, so nothing can be said on it.",
			};
		}

		try {
			const spoken = await session.speak(text);
			return spoken.ok
				? { spoken: true as const }
				: {
						spoken: false as const,
						reason: spoken.reason ?? "The audio could not be played.",
					};
		} catch (error) {
			return {
				spoken: false as const,
				reason: `Speaking failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	},
});
