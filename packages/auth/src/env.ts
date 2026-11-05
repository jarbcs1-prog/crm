import "@crm/env/load";

const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_APP_URL = "http://localhost:3000";

const optional = (key: string): string | undefined => {
	const value = process.env[key];
	return value && value.length > 0 ? value : undefined;
};

const googleCredentials = ():
	| { clientId: string; clientSecret: string }
	| undefined => {
	const clientId = optional("GOOGLE_CLIENT_ID");
	const clientSecret = optional("GOOGLE_CLIENT_SECRET");

	if (!clientId || !clientSecret) {
		if (clientId || clientSecret) {
			throw new Error(
				"GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together.",
			);
		}
		return undefined;
	}

	return { clientId, clientSecret };
};

const apiUrl =
	optional("API_URL") ?? optional("BETTER_AUTH_URL") ?? DEFAULT_API_URL;

const appUrls = (optional("APP_URL") ?? DEFAULT_APP_URL)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const appUrl = appUrls[0] ?? DEFAULT_APP_URL;

export function getApiUrl(): string {
	return optional("API_URL") ?? optional("BETTER_AUTH_URL") ?? DEFAULT_API_URL;
}

export function getAppUrl(): string {
	const urls = (optional("APP_URL") ?? DEFAULT_APP_URL)
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	return urls[0] ?? DEFAULT_APP_URL;
}

export function getAppUrls(): string[] {
	return (optional("APP_URL") ?? DEFAULT_APP_URL)
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
}

export const env = {
	get appUrl(): string {
		return getAppUrl();
	},
	google: googleCredentials(),
	get cookieDomain(): string | undefined {
		return optional("AUTH_COOKIE_DOMAIN");
	},
	get trustedOrigins(): string[] {
		return [...new Set([...getAppUrls(), getApiUrl()])];
	},
	get isProduction(): boolean {
		return process.env.NODE_ENV === "production";
	},
} as const;

export function isGoogleConfigured(): boolean {
	return googleCredentials() !== undefined;
}

export { apiUrl, appUrl };
