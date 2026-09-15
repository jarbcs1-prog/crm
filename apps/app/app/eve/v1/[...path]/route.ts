import {
	AGENT_URL,
	bridgeConfigured,
	mintBridgeToken,
} from "@/lib/agent-bridge";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const BODY_LIMIT = 1_048_576;

function limitedBody(body: ReadableStream<Uint8Array> | null): ReadableStream<Uint8Array> | null {
	if (!body) return null;
	let seen = 0;
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				seen += chunk.byteLength;
				if (seen > BODY_LIMIT) controller.error(new Error("Payload too large"));
				else controller.enqueue(chunk);
			},
		}),
	);
}

async function handler(request: Request): Promise<Response> {
	const cl = request.headers.get("content-length");
	if (cl && Number(cl) > BODY_LIMIT) {
		return Response.json({ error: "Payload too large." }, { status: 413 });
	}
	const _url = new URL(request.url);
	if (!_url.pathname.startsWith("/eve/")) {
		return Response.json({ error: "Not found." }, { status: 404 });
	}
	if (!bridgeConfigured()) {
		return Response.json(
			{ error: "The research agent is not configured for this install." },
			{ status: 503 },
		);
	}

	const session = await getSession();
	if (!session) {
		return Response.json({ error: "Not signed in." }, { status: 401 });
	}

	const url = new URL(request.url);
	const target = `${AGENT_URL}${url.pathname}${url.search}`;

	const headers = new Headers(request.headers);

	for (const header of [
		"host",
		"cookie",
		"x-forwarded-host",
		"x-forwarded-proto",
		"x-forwarded-for",
		"forwarded",
		"transfer-encoding",
		"connection",
		"keep-alive",
		"content-length",
		"expect",
	]) {
		headers.delete(header);
	}

	const contactId = request.headers.get("x-crm-contact");
	const companyId = request.headers.get("x-crm-company");
	const dealId = request.headers.get("x-crm-deal");
	headers.delete("x-crm-contact");
	headers.delete("x-crm-company");
	headers.delete("x-crm-deal");

	headers.set(
		"authorization",
		`Bearer ${await mintBridgeToken(
			{
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
			},
			{
				contactId: cuid(contactId),
				companyId: cuid(companyId),
				dealId: cuid(dealId),
			},
		)}`,
	);

	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers,
		redirect: "manual",
		signal: request.signal,
	};

	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = limitedBody(request.body) as unknown as BodyInit | null;
		init.duplex = "half";
	}

	let upstream: Response;

	try {
		upstream = await fetch(target, init);
	} catch (error) {
		return Response.json(
			{
				error: "The research agent is not reachable.",
				detail: error instanceof Error ? error.message : String(error),
			},
			{ status: 502 },
		);
	}

	const responseHeaders = new Headers(upstream.headers);
	for (const header of [
		"transfer-encoding",
		"connection",
		"content-encoding",
		"content-length",
	]) {
		responseHeaders.delete(header);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders,
	});
}

function cuid(value: string | null): string | undefined {
	return value && /^[a-z0-9]{20,32}$/.test(value) ? value : undefined;
}

export {
	handler as DELETE,
	handler as GET,
	handler as HEAD,
	handler as OPTIONS,
	handler as PATCH,
	handler as POST,
	handler as PUT,
};