import { defineTool } from "eve/tools";
import { z } from "zod";
import { getSession } from "../lib/telephony/session";

export default defineTool({
	description:
		"Speaks one short sentence into a live call that make_call answered. Wait for it to return before listening: the line is half-duplex, so audio played now cannot be interrupted. Returns spoken false with a reason when the call is gone instead of throwing.",
	inputSchema: z.object({
		callId: z
			.string()
			.min(1)
			.describe("The CRM call id returned by make_call."),
		text: z
			.string()
			.min(1)
			.describe("What to say. Keep it to one short sentence."),
	}),
	async execute({ callId, text }) {
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
