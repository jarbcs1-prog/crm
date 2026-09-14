import { afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import type { Session } from "@crm/auth";

const SECRET = "test-secret-at-least-long-enough-to-be-a-secret";

const session: Session = {
	session: {
		id: "sess_1",
		createdAt: new Date(),
		updatedAt: new Date(),
		userId: "user_1",
		expiresAt: new Date(Date.now() + 60_000),
		token: "tok_1",
		activeOrganizationId: "org_1",
	},
	user: {
		id: "user_1",
		createdAt: new Date(),
		updatedAt: new Date(),
		email: "lewis@trycomp.ai",
		emailVerified: true,
		name: "Lewis Carhart",
	},
};

let getSession: () => Promise<Session | null>;
let bridgeConfigured: () => boolean;
let mintBridgeToken: (
	user: { id: string; email: string; name: string },
	record?: { contactId?: string; companyId?: string; dealId?: string },
) => Promise<string>;
let handler: (request: Request) => Promise<Response>;

const realFetch = globalThis.fetch;

beforeAll(async () => {
	process.env.AGENT_BRIDGE_SECRET = SECRET;
	process.env.AGENT_URL = "http://127.0.0.1:2000";

	mock.module("../lib/session", () => ({
		getSession: () => getSession(),
	}));
	mock.module("../lib/agent-bridge", () => ({
		AGENT_URL: process.env.AGENT_URL,
		bridgeConfigured: () => bridgeConfigured(),
		mintBridgeToken: (user: unknown, record?: unknown) =>
			mintBridgeToken(
				user as { id: string; email: string; name: string },
				record as { contactId?: string; companyId?: string; dealId?: string },
			),
	}));

	({ getSession } = await import("../lib/session"));
	({ bridgeConfigured, mintBridgeToken } = await import("../lib/agent-bridge"));
	({ GET: handler } = await import("../app/eve/v1/[...path]/route"));
});

afterEach(() => {
	globalThis.fetch = realFetch;
	getSession = async () => session;
	bridgeConfigured = () => true;
	mintBridgeToken = async () => "minted-token";
});

function stub(
	handler: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
	globalThis.fetch = handler as unknown as typeof fetch;
}

function request(path = "/eve/v1/info", init: RequestInit = {}) {
	return new Request(new URL(path, "http://localhost:3000"), init);
}

describe("eve/v1 proxy", () => {
	it("answers 503 when the bridge is not configured", async () => {
		bridgeConfigured = () => false;

		const response = await handler(request());

		expect(response.status).toBe(503);
	});

	it("answers 401 when there is no session", async () => {
		getSession = async () => null;

		const response = await handler(request());

		expect(response.status).toBe(401);
	});

	it("answers 502 when the upstream agent is unreachable", async () => {
		stub(async () => {
			throw new Error("connect ECONNREFUSED");
		});

		const response = await handler(request());

		expect(response.status).toBe(502);
	});

	it("strips request-smuggling and hop-by-hop headers before forwarding", async () => {
		let forwarded: Headers | undefined;
		stub(async (_url, init) => {
			forwarded = new Headers((init as RequestInit)?.headers as HeadersInit);
			return new Response("ok", { status: 200 });
		});

		const response = await handler(
			request("/eve/v1/info", {
				headers: {
					host: "evil.example",
					cookie: "better-auth.session_token=abc.def",
					"x-forwarded-host": "evil.example",
					"x-forwarded-proto": "https",
					"x-forwarded-for": "203.0.113.9",
					forwarded: "for=203.0.113.9",
					"transfer-encoding": "chunked",
					connection: "keep-alive",
					"keep-alive": "timeout=5",
					"content-length": "2",
					expect: "100-continue",
					"x-crm-contact": "contact_1",
					"x-crm-company": "company_1",
					"x-crm-deal": "deal_1",
				},
			}),
		);

		expect(response.status).toBe(200);
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
			"x-crm-contact",
			"x-crm-company",
			"x-crm-deal",
		]) {
			expect(forwarded?.has(header)).toBe(false);
		}
	});

	it("carves x-crm-* ids into the bridge token and validates them as cuids", async () => {
		let mintedRecord: unknown;
		mintBridgeToken = async (_user, record) => {
			mintedRecord = record;
			return "minted-token";
		};

		await handler(
			request("/eve/v1/info", {
				headers: {
					"x-crm-contact": "contact_1",
					"x-crm-company": "not-a-cuid",
					"x-crm-deal": "deal_2",
				},
			}),
		);

		expect(mintedRecord).toEqual({
			contactId: undefined,
			companyId: undefined,
			dealId: undefined,
		});
	});

	it("sets the bearer token minted for the signed-in rep", async () => {
		let forwarded: Headers | undefined;
		let mintedUser: unknown;
		mintBridgeToken = async (user) => {
			mintedUser = user;
			return "minted-token";
		};
		stub(async (_url, init) => {
			forwarded = new Headers((init as RequestInit)?.headers as HeadersInit);
			return new Response("ok", { status: 200 });
		});

		await handler(request("/eve/v1/info"));

		expect(mintedUser).toEqual({
			id: "user_1",
			email: "lewis@trycomp.ai",
			name: "Lewis Carhart",
		});
		expect(forwarded?.get("authorization")).toBe("Bearer minted-token");
	});

	it("passes through the upstream status and body", async () => {
		stub(async () => new Response("agent says hi", { status: 201 }));

		const response = await handler(request("/eve/v1/info"));

		expect(response.status).toBe(201);
		expect(await response.text()).toBe("agent says hi");
	});

	it("strips hop-by-hop headers from the upstream response", async () => {
		stub(
			async () =>
				new Response("ok", {
					status: 200,
					headers: {
						"transfer-encoding": "chunked",
						connection: "keep-alive",
						"content-encoding": "gzip",
						"content-length": "2",
						"x-agent-version": "0.31.2",
					},
				}),
		);

		const response = await handler(request("/eve/v1/info"));

		for (const header of [
			"transfer-encoding",
			"connection",
			"content-encoding",
			"content-length",
		]) {
			expect(response.headers.has(header)).toBe(false);
		}
		expect(response.headers.get("x-agent-version")).toBe("0.31.2");
	});
});
