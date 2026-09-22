const TIMEOUT_MS = 45_000;

export type Answer = {
	text: string;
	citations: string[];
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

function _tavilyEnabled(): boolean {
	return Boolean(process.env.TAVILY_API_KEY);
}

function _exaEnabled(): boolean {
	return Boolean(process.env.EXA_API_KEY);
}

function _braveEnabled(): boolean {
	return Boolean(process.env.BRAVE_API_KEY);
}

function _firecrawlEnabled(): boolean {
	return Boolean(process.env.FIRECRAWL_API_KEY);
}

function _googleEnabled(): boolean {
	return Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID);
}

export type AskOptions = {
	domains?: string[];
	system?: string;
	deep?: boolean;
};

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
			...(options.system
				? { summary: { type: "detailed", instructions: options.system } }
				: {}),
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
					Accept: "application/json",
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

function decodeDdgUrl(href: string): string {
	if (href.startsWith("/l/?uddg=")) {
		try {
			const url = new URL(`https://duckduckgo.com${href}`);
			const uddg = url.searchParams.get("uddg");
			if (uddg) return decodeURIComponent(uddg);
		} catch {
			// fall through to returning the raw href
		}
	}
	return href;
}

export function parseDuckDuckGo(html: string): {
	text: string;
	citations: string[];
} {
	const citations: string[] = [];
	const snippets: string[] = [];

	for (const match of html.matchAll(
		/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g,
	)) {
		const href = match[1];
		if (!href) continue;
		const url = decodeDdgUrl(href);
		if (url && !citations.includes(url)) citations.push(url);
	}

	for (const match of html.matchAll(
		/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
	)) {
		const raw = match[1];
		if (!raw) continue;
		const text = raw.replace(/<[^>]+>/g, "").trim();
		if (text) snippets.push(text);
	}

	const text = snippets.join("\n");
	return { text, citations };
}

async function askDuckDuckGo(
	question: string,
	options: AskOptions,
): Promise<Outcome<Answer>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const query = options.domains?.length
			? `${options.domains.map((d) => `site:${d}`).join(" OR ")} ${question}`
			: question;

		const params = new URLSearchParams({ q: query });
		const response = await fetch(
			`https://html.duckduckgo.com/html/?${params.toString()}`,
			{
				headers: {
					"User-Agent":
						"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
				},
				signal: controller.signal,
			},
		);

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const html = await response.text();
		const { text, citations } = parseDuckDuckGo(html);
		if (!text && citations.length === 0) {
			return { ok: false, reason: "No results." };
		}

		return {
			ok: true,
			data: { text: text || citations.join("\n"), citations },
		};
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
	const providers = [
		askTavily,
		askExa,
		askBrave,
		askFirecrawl,
		askGoogle,
		askDuckDuckGo,
	];

	for (const provider of providers) {
		const result = await provider(question, options);
		if (result.ok) return result;
	}

	return {
		ok: false,
		reason:
			"No web search results. DuckDuckGo is used as a fallback when no API key is set; if it failed, check network access.",
	};
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
			if (!slug) continue;
			if (!slugs.includes(slug)) slugs.push(slug);
		}

		if (slugs.length > 0) break;
	}

	return slugs;
}
