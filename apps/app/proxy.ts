import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
	ONBOARDING_COOKIE,
	ONBOARDING_PATH,
	readOnboardingGate,
	settleOnboarding,
} from "@/lib/onboarding";

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

	const gate = await readOnboardingGate(request);

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
