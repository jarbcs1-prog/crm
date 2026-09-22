import {
	AGENT_URL,
	bridgeConfigured,
	mintBridgeToken,
} from "@/lib/agent-bridge";
import { createProxyRoute } from "@/lib/proxy/createProxyRoute";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function cuid(value: string | null): string | undefined {
	return value && /^[a-z0-9]{20,32}$/.test(value) ? value : undefined;
}

const h = createProxyRoute({
	targetBaseUrl: AGENT_URL,
	allowedPrefixes: ["/eve/"],
	headersToStrip: [
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
	],
	onFetchError: (error) =>
		Response.json(
			{
				error: "The research agent is not reachable.",
				detail: error instanceof Error ? error.message : String(error),
			},
			{ status: 502 },
		),
	beforeRequest: async (request, headers) => {
		if (!bridgeConfigured()) {
			return Response.json(
				{ error: "The research agent is not configured for this install." },
				{ status: 503 },
			);
		}
		const session = await getSession();
		if (!session)
			return Response.json({ error: "Not signed in." }, { status: 401 });

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
	},
});

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = h;
