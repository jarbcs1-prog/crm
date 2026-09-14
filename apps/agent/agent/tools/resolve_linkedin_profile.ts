import { defineTool } from "eve/tools";
import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { spend } from "../lib/focus";
import { searchTerms } from "../lib/names";
import { findProfileUrls } from "../lib/web-search";

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
		"Find candidate LinkedIn profile slugs for a work email address. Returns CANDIDATES ONLY — you must verify each with get_linkedin_profile before believing any of them.",
	inputSchema: z.object({
		email: z.string().describe("The contact's work email address."),
		companyName: z.string().describe("The company the CRM has them at."),
	}),
	async execute({ email, companyName }) {
		if (!searchEnabled()) {
			return { candidateSlugs: [], ...unavailable("TAVILY_API_KEY or EXA_API_KEY or BRAVE_API_KEY or FIRECRAWL_API_KEY or GOOGLE_API_KEY or PERPLEXITY_API_KEY") };
		}

		const charge = spend();
		if (!charge.ok) return { candidateSlugs: [], note: charge.reason };

		const local = email.split("@")[0] ?? "";
		const terms = searchTerms(local);
		const slugs = await findProfileUrls(terms, companyName);

		return {
			searchedFor: terms,
			candidateSlugs: slugs.slice(0, 5),
			note: "Unverified. Each slug must be checked with get_linkedin_profile.",
		};
	},
});
