import { API_URL } from "@/lib/env";
import { createProxyRoute } from "@/lib/proxy/createProxyRoute";

const h = createProxyRoute({
	targetBaseUrl: API_URL,
	allowedPrefixes: ["/api/"],
	decodeResponse: true,
});

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = h;
