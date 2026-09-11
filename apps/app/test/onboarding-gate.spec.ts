import { afterEach, describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { ONBOARDING_COOKIE, readOnboardingGate } from "../lib/onboarding";
import { proxy } from "../proxy";

const SESSION_COOKIE = "better-auth.session_token=abc.def";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function stub(handler: () => Promise<Response>) {
	globalThis.fetch = handler as unknown as typeof fetch;
}

function answerWith(body: unknown, status = 200) {
	stub(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	);
}

function request(pathname: string, cookies: string[] = []) {
	return new NextRequest(new URL(pathname, "http://localhost:3000"), {
		headers: cookies.length ? { cookie: cookies.join("; ") } : {},
	});
}

function redirectedTo(response: Response): string | null {
	const location = response.headers.get("location");

	return location ? new URL(location).pathname : null;
}

const workspace = (data: { onboarded: boolean; canRename: boolean }) => ({
	result: { data },
});

describe("readOnboardingGate", () => {
	it("reads the answer out of a plain tRPC envelope", async () => {
		answerWith(workspace({ onboarded: false, canRename: true }));

		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"required",
		);
	});

	it("settles for someone who could not answer the form anyway", async () => {
		answerWith(workspace({ onboarded: false, canRename: false }));

		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"settled",
		);
	});

	it("is unknown rather than required when the API cannot be read", async () => {
		answerWith({ error: { message: "UNAUTHORIZED" } }, 401);
		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"unknown",
		);

		stub(async () => {
			throw new Error("connect ECONNREFUSED");
		});
		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"unknown",
		);

		answerWith({ result: { data: { nothing: "useful" } } });
		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"unknown",
		);
	});
});

describe("proxy", () => {
	it("sends a stranger to sign in and leaves them there", async () => {
		expect(redirectedTo(await proxy(request("/companies")))).toBe("/sign-in");
		expect(redirectedTo(await proxy(request("/sign-in")))).toBeNull();
	});

	it("gates a signed-in rep who has not answered the form", async () => {
		answerWith(workspace({ onboarded: false, canRename: true }));

		expect(
			redirectedTo(await proxy(request("/companies", [SESSION_COOKIE]))),
		).toBe("/onboarding");
	});

	it("lets the form itself render", async () => {
		answerWith(workspace({ onboarded: false, canRename: true }));

		expect(
			redirectedTo(await proxy(request("/onboarding", [SESSION_COOKIE]))),
		).toBeNull();
	});

	it("asks once, then remembers", async () => {
		let calls = 0;
		stub(async () => {
			calls += 1;
			return new Response(
				JSON.stringify(workspace({ onboarded: true, canRename: true })),
			);
		});

		const first = await proxy(request("/companies", [SESSION_COOKIE]));
		const marker = first.cookies.get(ONBOARDING_COOKIE);

		expect(marker?.value).toBe("1");
		expect(marker?.httpOnly).toBe(true);
		expect(calls).toBe(1);

		await proxy(
			request("/companies", [SESSION_COOKIE, `${ONBOARDING_COOKIE}=1`]),
		);

		expect(calls).toBe(1);
	});

	it("takes a settled rep off the form", async () => {
		answerWith(workspace({ onboarded: true, canRename: true }));

		expect(
			redirectedTo(await proxy(request("/onboarding", [SESSION_COOKIE]))),
		).toBe("/");
	});

	it("never fights /grant-access, which would ping-pong forever", async () => {
		answerWith(workspace({ onboarded: false, canRename: true }));

		expect(
			redirectedTo(await proxy(request("/grant-access", [SESSION_COOKIE]))),
		).toBeNull();
	});

	it("leaves the agent bridge alone", async () => {
		answerWith(workspace({ onboarded: false, canRename: true }));

		expect(
			redirectedTo(await proxy(request("/eve/v1/info", [SESSION_COOKIE]))),
		).toBeNull();
	});

	it("fails open when the API is unreachable", async () => {
		stub(async () => {
			throw new Error("connect ECONNREFUSED");
		});

		const response = await proxy(request("/companies", [SESSION_COOKIE]));

		expect(redirectedTo(response)).toBeNull();
		expect(response.cookies.get(ONBOARDING_COOKIE)).toBeUndefined();
	});
});
