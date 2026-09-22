import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

const DEFAULT_BODY_LIMIT = 1_048_576;

function decode(buf: Buffer, encoding: string | null): Buffer {
	const enc = (encoding ?? "").toLowerCase();
	try {
		if (enc.includes("br")) return brotliDecompressSync(buf);
		if (enc.includes("gzip")) return gunzipSync(buf);
		if (enc.includes("deflate")) return inflateSync(buf);
	} catch {}
	return buf;
}

function limitedBody(
	body: ReadableStream<Uint8Array> | null,
	limit: number,
): ReadableStream<Uint8Array> | null {
	if (!body) return null;
	let seen = 0;
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				seen += chunk.byteLength;
				if (seen > limit) controller.error(new Error("Payload too large"));
				else controller.enqueue(chunk);
			},
		}),
	);
}

export type ProxyRouteOptions = {
	targetBaseUrl: string;
	allowedPrefixes?: string[];
	bodyLimit?: number;
	headersToStrip?: string[];
	responseHeadersToStrip?: string[];
	decodeResponse?: boolean;
	beforeRequest?: (req: Request, headers: Headers) => Promise<Response | void>;
	onFetchError?: (error: unknown, req: Request) => Response;
};

export function createProxyRoute(opts: ProxyRouteOptions) {
	const bodyLimit = opts.bodyLimit ?? DEFAULT_BODY_LIMIT;
	const headersToStrip = opts.headersToStrip ?? [
		"host",
		"x-forwarded-host",
		"x-forwarded-proto",
		"x-forwarded-for",
		"forwarded",
		"transfer-encoding",
		"connection",
		"keep-alive",
		"content-length",
		"expect",
	];
	const responseHeadersToStrip = opts.responseHeadersToStrip ?? [
		"transfer-encoding",
		"connection",
		"content-encoding",
		"content-length",
	];

	const handler = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);

		if (opts.allowedPrefixes && !opts.allowedPrefixes.some((p) => url.pathname.startsWith(p))) {
			return Response.json({ error: "Not found." }, { status: 404 });
		}

		const cl = request.headers.get("content-length");
		if (cl && Number(cl) > bodyLimit) {
			return Response.json({ error: "Payload too large." }, { status: 413 });
		}

		const headers = new Headers(request.headers);
		for (const h of headersToStrip) headers.delete(h);

		if (opts.beforeRequest) {
			const early = await opts.beforeRequest(request, headers);
			if (early) return early;
		}

		const target = `${opts.targetBaseUrl}${url.pathname}${url.search}`;

		const init: RequestInit & { duplex?: "half" } = {
			method: request.method,
			headers,
			redirect: "manual",
			signal: request.signal,
		};
		if (request.method !== "GET" && request.method !== "HEAD") {
			init.body = limitedBody(request.body, bodyLimit) as unknown as BodyInit | null;
			init.duplex = "half";
		}

		let upstream: Response;
		try {
			upstream = await fetch(target, init);
		} catch (error) {
			if (opts.onFetchError) return opts.onFetchError(error, request);
			return Response.json({ error: "The API is not reachable." }, { status: 502 });
		}

		const responseHeaders = new Headers(upstream.headers);
		for (const h of responseHeadersToStrip) responseHeaders.delete(h);

		const setCookies = upstream.headers.getSetCookie?.() ?? [];
		if (setCookies.length > 0) {
			responseHeaders.delete("set-cookie");
			for (const c of setCookies) responseHeaders.append("set-cookie", c);
		}

		if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
			return new Response(upstream.body, {
				status: upstream.status,
				statusText: upstream.statusText,
				headers: responseHeaders,
			});
		}

		if (opts.decodeResponse) {
			const raw = Buffer.from(await upstream.arrayBuffer());
			const body = decode(raw, upstream.headers.get("content-encoding"));
			return new Response(new Uint8Array(body), {
				status: upstream.status,
				statusText: upstream.statusText,
				headers: responseHeaders,
			});
		}

		return new Response(upstream.body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: responseHeaders,
		});
	};

	const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
	return Object.fromEntries(methods.map((m) => [m, handler])) as Record<
		(typeof methods)[number],
		typeof handler
	>;
}
