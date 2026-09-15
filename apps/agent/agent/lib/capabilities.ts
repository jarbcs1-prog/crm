import "@crm/env/load";

export type Capability = {
	readonly env: string;
	readonly label: string;
	readonly gives: string;
	readonly enabled: boolean;
};

export function capabilities(): readonly Capability[] {
	const set = (key: string) => Boolean(process.env[key]?.trim());

	return [
		{
			env: "RAPIDAPI_KEY",
			label: "LinkedIn",
			gives:
				"a person's real name, current title, employer and tenure, self-reported and so authoritative on identity",
			enabled: set("RAPIDAPI_KEY"),
		},
		{
			env: "TAVILY_API_KEY",
			label: "Web research",
			gives:
				"open-web context with citations and the search that finds a LinkedIn slug in the first place",
			enabled: set("TAVILY_API_KEY"),
		},
		{
			env: "EXA_API_KEY",
			label: "Exa search",
			gives: "semantic web search and research, with citations",
			enabled: set("EXA_API_KEY"),
		},
		{
			env: "BRAVE_API_KEY",
			label: "Brave Search",
			gives: "privacy-focused web search results with content snippets",
			enabled: set("BRAVE_API_KEY"),
		},
		{
			env: "FIRECRAWL_API_KEY",
			label: "Firecrawl",
			gives: "scraping and extracting content from websites for research",
			enabled: set("FIRECRAWL_API_KEY"),
		},
		{
			env: "GOOGLE_API_KEY",
			label: "Google Search",
			gives: "traditional web search via Google Custom Search API",
			enabled: set("GOOGLE_API_KEY"),
		},
		{
			env: "DUCKDUCKGO",
			label: "DuckDuckGo",
			gives:
				"privacy-focused web search with no API key, used as the default fallback when no other search provider is configured",
			enabled: true,
		},
		{
			env: "CONTEXT_DEV_API_KEY",
			label: "Company brand data",
			gives: "a company's logo, industry, location and socials from its domain",
			enabled: set("CONTEXT_DEV_API_KEY"),
		},
		{
			env: "BLOB_READ_WRITE_TOKEN",
			label: "Picture storage",
			gives:
				"somewhere to keep a logo or a profile photo. Without it a record has no picture at all, because the URLs these sources hand back expire and are never stored as they are",
			enabled: set("BLOB_READ_WRITE_TOKEN"),
		},
		{
			env: "VOIPSTUDIO_API_KEY",
			label: "Voice calling",
			gives:
				"an outbound live call to a contact. The agent rings them and qualifies them using the legal approach script; say quietly on every call that you are an AI assistant making a cold call for the company",
			enabled: set("VOIPSTUDIO_API_KEY"),
		},
		{
			env: "DEEPGRAM_API_KEY",
			label: "Deepgram transcription",
			gives:
				"speech-to-text for live calls, so the agent hears what the contact says as it happens",
			enabled: set("DEEPGRAM_API_KEY"),
		},
		{
			env: "ELEVENLABS_API_KEY",
			label: "ElevenLabs voices",
			gives: "natural text-to-speech voices for live outbound calls",
			enabled: set("ELEVENLABS_API_KEY"),
		},
		{
			env: "CARTESIA_API_KEY",
			label: "Cartesia voices",
			gives:
				"ultra-low-latency text-to-speech, so live call replies start without a pause",
			enabled: set("CARTESIA_API_KEY"),
		},
		{
			env: "TWILIO_ACCOUNT_SID",
			label: "Twilio dialing",
			gives:
				"outbound PSTN and SIP dialing for live cold calls, with the account SID and auth token set together",
			enabled: set("TWILIO_ACCOUNT_SID"),
		},
		{
			env: "TELNYX_API_KEY",
			label: "Telnyx dialing",
			gives: "SIP trunking for outbound cold calls as an alternative carrier",
			enabled: set("TELNYX_API_KEY"),
		},
		{
			env: "OLLAMA_BASE_URL",
			label: "Ollama (local LLM)",
			gives:
				"a local OpenAI-compatible model (e.g. qwen2.5-coder:14b) for research and briefs without cloud egress",
			enabled: set("OLLAMA_BASE_URL"),
		},
		{
			env: "LMSTUDIO_BASE_URL",
			label: "LM Studio",
			gives: "a local LM Studio model server, OpenAI-compatible",
			enabled: set("LMSTUDIO_BASE_URL"),
		},
		{
			env: "LLAMA_CPP_BASE_URL",
			label: "llama.cpp",
			gives: "a local llama.cpp server, OpenAI-compatible",
			enabled: set("LLAMA_CPP_BASE_URL"),
		},
		{
			env: "KOBOLD_BASE_URL",
			label: "KoboldCpp",
			gives: "a local KoboldCpp server, OpenAI-compatible",
			enabled: set("KOBOLD_BASE_URL"),
		},
		{
			env: "OPENCODE_API_KEY",
			label: "Opencode",
			gives: "the Opencode gateway for hosted model routing",
			enabled: set("OPENCODE_API_KEY"),
		},
		{
			env: "OPENROUTER_API_KEY",
			label: "OpenRouter",
			gives: "OpenRouter gateway (100+ models) for hosted inference",
			enabled: set("OPENROUTER_API_KEY"),
		},
		{
			env: "REPLICATE_API_TOKEN",
			label: "Replicate",
			gives: "Replicate hosted inference for LLMs and image models",
			enabled: set("REPLICATE_API_TOKEN"),
		},
	];
}

export function enabled(env: string): boolean {
	return capabilities().some(
		(capability) => capability.env === env && capability.enabled,
	);
}

export function unavailable(env: string): {
	ok: false;
	configured: false;
	reason: string;
} {
	return {
		ok: false,
		configured: false,
		reason:
			`This install has no ${env}, so that source is unavailable. This is not a failure and retrying will not help — ` +
			"use what the CRM already knows and say in your write-up what you could not check.",
	};
}

export function capabilitiesMarkdown(): string {
	const all = capabilities();
	const on = all.filter((capability) => capability.enabled);
	const off = all.filter((capability) => !capability.enabled);

	const lines = ["## What you can use here", ""];

	if (on.length === 0) {
		lines.push(
			"No outside sources are configured on this install. Everything you can",
			"learn is already in the CRM — email threads, meetings, signature",
			"blocks — and `read_crm_history` reads all of it for free. That is",
			"often enough to settle who somebody is. Record what it shows, and",
			"leave the rest empty.",
		);
		return lines.join("\n");
	}

	lines.push("Available:");
	for (const capability of on) {
		lines.push(`- **${capability.label}** — ${capability.gives}.`);
	}

	if (off.length > 0) {
		lines.push("", "Not configured here, so do not plan around them:");
		for (const capability of off) {
			lines.push(`- ${capability.label}`);
		}
		lines.push(
			"",
			"Their tools will tell you the same thing if you call them. Note what",
			"you could not check rather than guessing at it.",
		);
	}

	return lines.join("\n");
}
