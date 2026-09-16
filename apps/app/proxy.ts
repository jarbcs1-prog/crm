import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
	ONBOARDING_COOKIE,
	ONBOARDING_PATH,
	type OnboardingGate,
	readOnboardingGate,
	settleOnboarding,
} from "@/lib/onboarding";

const GATE_TTL_MS = 10_000;
const gateCache = new Map<string, { value: OnboardingGate; at: number }>();
let lastFetch: typeof globalThis.fetch = globalThis.fetch;

async function getCachedGate(request: NextRequest): Promise<OnboardingGate> {
	if (lastFetch !== globalThis.fetch) {
		gateCache.clear();
		lastFetch = globalThis.fetch;
	}
	const session = getSessionCookie(request);
	const key = session ?? "__no_cookie__";
	const hit = gateCache.get(key);
	if (hit && Date.now() - hit.at < GATE_TTL_MS) return hit.value;
	const value = await readOnboardingGate(request);
	if (value === "unknown") {
		gateCache.delete(key);
		return value;
	}
	gateCache.set(key, { value, at: Date.now() });
	if (gateCache.size > 500) {
		const oldest = gateCache.keys().next().value as string | undefined;
		if (oldest) gateCache.delete(oldest);
	}
	return value;
}

const SIGN_IN_PATH = "/sign-in";

const UNGATED = [SIGN_IN_PATH, "/grant-access", "/eve"];

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (getSessionCookie(request) === null) {
		return pathname === SIGN_IN_PATH
			? NextResponse.next()
			: NextResponse.redirect(new URL(SIGN_IN_PATH, request.nextUrl));
	}

	if (isUngated(pathname)) return NextResponse.next();

	if (request.cookies.has(ONBOARDING_COOKIE)) return beyondOnboarding(request);

	const gate = await getCachedGate(request);

	if (gate === "unknown") return NextResponse.next();

	if (gate === "required") {
		return pathname === ONBOARDING_PATH
			? NextResponse.next()
			: NextResponse.redirect(new URL(ONBOARDING_PATH, request.nextUrl));
	}

	const response = beyondOnboarding(request);
	settleOnboarding(request, response);

	return response;
}

function isUngated(pathname: string): boolean {
	return UNGATED.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

function beyondOnboarding(request: NextRequest): NextResponse {
	return request.nextUrl.pathname === ONBOARDING_PATH
		? NextResponse.redirect(new URL("/", request.nextUrl))
		: NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|webmanifest)$).*)",
	],
};
