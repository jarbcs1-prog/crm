import type { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/env";

export const ONBOARDING_PATH = "/onboarding";

export const ONBOARDING_COOKIE = "crm.onboarded";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const GATE_TIMEOUT_MS = 2_000;

export type OnboardingGate = "settled" | "required" | "unknown";

export async function readOnboardingGate(
	request: NextRequest,
): Promise<OnboardingGate> {
	const cookie = request.headers.get("cookie");

	if (!cookie) return "unknown";

	try {
		const response = await fetch(`${API_URL}/api/trpc/workspace.get`, {
			headers: { cookie },
			signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
		});

		if (!response.ok) return "unknown";

		const body = (await response.json()) as {
			result?: { data?: { onboarded?: boolean; canRename?: boolean } };
		};

		const workspace = body.result?.data;

		if (typeof workspace?.onboarded !== "boolean") return "unknown";

		return workspace.onboarded || !workspace.canRename ? "settled" : "required";
	} catch {
		return "unknown";
	}
}

export function settleOnboarding(
	request: NextRequest,
	response: NextResponse,
): void {
	response.cookies.set(ONBOARDING_COOKIE, "1", {
		httpOnly: true,
		sameSite: "lax",
		secure: request.nextUrl.protocol === "https:",
		path: "/",
		maxAge: COOKIE_MAX_AGE,
	});
}
