const TIMEOUT_MS = 45_000;

export type Answer = {
	text: string;
	citations: string[];
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export function perplexityEnabled(): boolean {
	return Boolean(
		process.env.PERPLEXITY_API_KEY ||
			process.env.TAVILY_API_KEY ||
			process.env.EXA_API_KEY ||
			process.env.BRAVE_API_KEY ||
			process.env.FIRECRAWL_API_KEY ||
			process.env.GOOGLE_API_KEY,
	);
}

function tavilyEnabled(): boolean {
	return Boolean(process.env.TAVILY_API_KEY);
}

function exaEnabled(): boolean {
	return Boolean(process.env.EXA_API_KEY);
}

function braveEnabled(): boolean {
	return Boolean(process.env.BRAVE_API_KEY);
}

function firecrawlEnabled(): boolean {
	return Boolean(process.env.FIRECRAWL_API_KEY);
}

function googleEnabled(): boolean {
	return Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID);
}

export type AskOptions = {
	model?: "sonar" | "sonar-pro";
	domains?: string[];
	system?: string;
	deep?: boolean;
};

async function askPerplexity(
	question: string,
	options: AskOptions,
): Promise<Outcome<Answer>> {
	const apiKey = process.env.PERPLEXITY_API_KEY;
	if (!apiKey) return { ok: false, reason: "No PERPLEXITY_API_KEY." };

	const ENDPOINT = "https://api.perplexity.ai/chat/completions";
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify({
				model: options.model ?? "sonar",
				messages: [
					...(options.system
						? [{ role: "system", content: options.system }]
						: []),
					{ role: "user", content: question },
				],
				...(options.domains ? { search_domain_filter: options.domains } : {}),
			}),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as {
			choices?: { message?: { content?: string } }[];
			citations?: string[];
			search_results?: { url?: string }[];
		};

		const text = body.choices?.[0]?.message?.content?.trim() ?? "";
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations =
			body.citations ??
			(body.search_results ?? []).flatMap((r) => (r.url ? [r.url] : []));

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function askTavily(
	question: string,
	options: AskOptions,
): Promise<Outcome<Answer>> {
	const apiKey = process.env.TAVILY_API_KEY;
	if (!apiKey) return { ok: false, reason: "No TAVILY_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const body = {
			query: question,
			...(options.domains ? { domains: options.domains } : {}),
			...(options.system ? { system_prompt: options.system } : {}),
			search_depth: options.deep ? "advanced" : "basic",
			num_results: options.deep ? 10 : 5,
			include_answer: true,
			include_source: true,
		};

		const response = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const data = (await response.json()) as {
			answer?: string;
			results?: { url: string; title?: string; content?: string }[];
		};

		const text = data.answer ?? "";
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations = (data.results ?? [])
			.map((r) => r.url)
			.filter((url): url is string => Boolean(url));

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function askExa(
	question: string,
	options: AskOptions,
): Promise<Outcome<Answer>> {
	const apiKey = process.env.EXA_API_KEY;
	if (!apiKey) return { ok: false, reason: "No EXA_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const body: Record<string, unknown> = {
			query: question,
			...(options.deep ? { depth: "deep" } : { depth: "basic" }),
			...(options.domains ? { include_domains: options.domains } : {}),
			...(options.system ? { summary: { type: "detailed", instructions: options.system } } : {}),
			num_results: options.deep ? 10 : 5,
			visualize_results: false,
			...(options.system ? { character: "comprehensive" } : {}),
		};

		const response = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const data = (await response.json()) as {
			results?: { url: string; title?: string; content?: string }[];
			citations?: string[];
		};

		const results = data.results ?? [];
		const text =
			results.map((r) => r.content ?? r.title ?? "").join("\n") || "";
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations = data.citations ?? results.map((r) => r.url);

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function askBrave(
	question: string,
	options: AskOptions,
): Promise<Outcome<Answer>> {
	const apiKey = process.env.BRAVE_API_KEY;
	if (!apiKey) return { ok: false, reason: "No BRAVE_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const params = new URLSearchParams({
			q: question,
			count: options.deep ? "10" : "5",
			...(options.domains ? { source: options.domains.join(",") } : {}),
		});

		const response = await fetch(
			`https://api.search.brave.com/res/v1/web/search?${params}`,
			{
				headers: {
					"Accept": "application/json",
					"X-Subscription-Token": apiKey,
				},
				signal: controller.signal,
			},
		);

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const data = (await response.json()) as {
			results?: { url: string; title?: string; description?: string }[];
		};

		const results = data.results ?? [];
		const text = results.map((r) => r.description ?? r.title ?? "").join("\n");
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations = results.map((r) => r.url);

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function askGoogle(
	question: string,
	options: AskOptions,
): Promise<Outcome<Answer>> {
	const apiKey = process.env.GOOGLE_API_KEY;
	const cseId = process.env.GOOGLE_CSE_ID;
	if (!apiKey) return { ok: false, reason: "No GOOGLE_API_KEY." };
	if (!cseId) return { ok: false, reason: "No GOOGLE_CSE_ID." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const params = new URLSearchParams({
			q: question,
			key: apiKey,
			cx: cseId,
			num: options.deep ? "10" : "5",
		});

		const response = await fetch(
			`https://www.googleapis.com/customsearch/v1?${params}`,
			{
				signal: controller.signal,
			},
		);

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const data = (await response.json()) as {
			items?: { url: string; title?: string; snippet?: string }[];
		};

		const results = data.items ?? [];
		const text = results.map((r) => r.snippet ?? r.title ?? "").join("\n");
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations = results.map((r) => r.url);

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	if (perplexityEnabled()) {
		if (tavilyEnabled()) {
			const result = await askTavily(question, options);
			if (result.ok) return result;
		}
		if (exaEnabled()) {
			const result = await askExa(question, options);
			if (result.ok) return result;
		}
		if (braveEnabled()) {
			const result = await askBrave(question, options);
			if (result.ok) return result;
		}
		if (firecrawlEnabled()) {
			const result = await askFirecrawl(question, options);
			if (result.ok) return result;
		}
		if (googleEnabled()) {
			const result = await askGoogle(question, options);
			if (result.ok) return result;
		}
		if (process.env.PERPLEXITY_API_KEY) {
			const result = await askPerplexity(question, options);
			if (result.ok) return result;
		}
	}

	return {
		ok: false,
		reason:
			"No search API key configured. Set TAVILY_API_KEY, EXA_API_KEY, BRAVE_API_KEY, FIRECRAWL_API_KEY, GOOGLE_API_KEY (with GOOGLE_CSE_ID), or PERPLEXITY_API_KEY.",
	};
}

async function askFirecrawl(
	question: string,
	options: AskOptions,
): Promise<Outcome<Answer>> {
	const apiKey = process.env.FIRECRAWL_API_KEY;
	if (!apiKey) return { ok: false, reason: "No FIRECRAWL_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch("https://api.firecrawl.dev/v0/search", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify({
				query: question,
				categories: options.domains ?? ["news", "general"],
				max_results: options.deep ? 10 : 5,
			}),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const data = (await response.json()) as {
			data?: { url: string; title?: string; content?: string }[];
		};

		const results = data.data ?? [];
		const text = results.map((r) => r.content ?? r.title ?? "").join("\n");
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations = results.map((r) => r.url);

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function findProfileUrls(
	terms: string[],
	companyName: string,
): Promise<string[]> {
	const slugs: string[] = [];

	for (const term of terms) {
		const answer = await ask(
			`Find the LinkedIn profile of the person called "${term}" who works at ${companyName}. Reply with their profile URL only.`,
			{ domains: ["linkedin.com"] },
		);

		if (!answer.ok) continue;

		const haystack = [answer.data.text, ...answer.data.citations].join(" ");
		for (const match of haystack.matchAll(
			/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/g,
		)) {
			const slug = match[1];
			if (slug && !slugs.includes(slug)) slugs.push(slug);
		}

		if (slugs.length > 0) break;
	}

	return slugs;
}