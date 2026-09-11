import { defineTool } from "eve/tools";
import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { spend } from "../lib/focus";
import { ask } from "../lib/perplexity";

function searchEnabled(): boolean {
	return (
		enabled("TAVILY_API_KEY") ||
		enabled("EXA_API_KEY") ||
		enabled("BRAVE_API_KEY") ||
		enabled("FIRECRAWL_API_KEY") ||
		enabled("GOOGLE_API_KEY") ||
		enabled("PERPLEXITY_API_KEY")
	);
}

export default defineTool({
	description:
		"Research a person or company on the open web for sales context — recent news, funding, launches, public statements. Returns cited claims. NOT a source of truth for someone's identity or job title; use get_linkedin_profile for that.",
	inputSchema: z.object({
		question: z
			.string()
			.describe(
				"A specific question, e.g. 'What has Acme announced in the last 6 months?'",
			),
		deep: z
			.boolean()
			.default(false)
			.describe("Reason over more sources. Slower, better for prep briefs."),
	}),
	async execute({ question, deep }) {
		if (!searchEnabled())
			return unavailable("TAVILY_API_KEY or EXA_API_KEY or BRAVE_API_KEY or FIRECRAWL_API_KEY or GOOGLE_API_KEY or PERPLEXITY_API_KEY");

		const charge = spend(deep ? 2 : 1);
		if (!charge.ok) return { ok: false as const, reason: charge.reason };

		const answer = await ask(question, {
			model: deep ? "sonar-pro" : "sonar",
			system:
				"You are researching for a B2B sales rep. Be specific and factual. " +
				"State only what your sources support, prefer recent information and " +
				"say plainly when you do not know. Never speculate about a person.",
		});

		if (!answer.ok) return { ok: false as const, reason: answer.reason };

		return {
			ok: true as const,
			answer: answer.data.text,
			citations: answer.data.citations,
			note: "Only write claims that have a citation.",
		};
	},
});
