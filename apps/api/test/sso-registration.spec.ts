import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { SsoService } from "../src/sso/sso.service";

function svc(role: string | null) {
	const db = {
		member: {
			findUnique: async () => (role === null ? null : { role }),
		},
		ssoProvider: {
			findUniqueOrThrow: async () => ({
				providerId: "okta",
				issuer: "https://acme.okta.com",
				domain: "acme.com",
				oidcConfig: JSON.stringify({ clientId: "0oa1b2c3d4WXYZ" }),
				samlConfig: null,
			}),
		},
	} as unknown as Db;

	return new SsoService(db);
}

describe("SSO registration gates", () => {
	it("refuses a member from registering", async () => {
		const sso = svc("member");
		expect(
			sso.register("u1", new Headers(), {
				providerId: "okta",
				issuer: "https://acme.okta.com",
				domain: "acme.com",
				clientId: "id",
				clientSecret: "secret",
			}),
		).rejects.toThrow();
	});

	it("blocks private issuer URLs", async () => {
		const sso = svc("owner");
		expect(
			sso.register("u1", new Headers(), {
				providerId: "okta",
				issuer: "http://127.0.0.1/.well-known/openid-configuration",
				domain: "acme.com",
				clientId: "id",
				clientSecret: "secret",
			}),
		).rejects.toThrow();
	});
});
