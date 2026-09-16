import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { DATABASE } from "../src/database/database.constants";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

if (
	process.env.NONOH_PASSWORD &&
	process.env.NONOH_PASSWORD.length > 0 &&
	process.env.NONOH_PASSWORD.length < 16
) {
	process.env.NONOH_PASSWORD = "test-password-at-least-16-chars-long";
}

fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);
fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

describe("Auth (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { AppModule } = await import("../src/app.module");

		const mockDb: Record<string, unknown> = {
			$connect: async () => {},
			$disconnect: async () => {},
			user: { findUnique: async () => null },
			session: { findUnique: async () => null },
			account: { findMany: async () => [] },
			member: { findUnique: async () => null },
			ssoProvider: {
				findMany: async () => [],
				findUnique: async () => null,
				count: async () => 0,
			},
			verification: { findFirst: async () => null },
		};

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(DATABASE)
			.useValue(mockDb)
			.compile();

		app = moduleFixture.createNestApplication({ bodyParser: false });
		await app.init();
	}, 30000);

	afterAll(async () => {
		if (app) await app.close();
	});

	it("rejects an unauthenticated request to a guarded route", async () => {
		await request(app.getHttpServer()).get("/auth/me").expect(401);
	});

	it("allows an unauthenticated request to an optional-auth route", async () => {
		const response = await request(app.getHttpServer())
			.get("/auth/session")
			.expect(200);

		expect(response.body).toEqual({ authenticated: false, user: null });
	});

	it("mounts the Better Auth handler", async () => {
		const response = await request(app.getHttpServer()).get("/api/auth/ok");

		expect(response.status).not.toBe(404);
	});

	it("lets the sign-in page read what it may offer", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/trpc/sso.signInOptions")
			.expect(200);

		expect(response.body.result.data).toEqual({ google: true, providers: [] });
	});

	it("keeps the SSO configuration itself behind the session", async () => {
		const response = await request(app.getHttpServer()).get(
			"/api/trpc/sso.settings",
		);

		expect(response.status).toBe(401);
	});
});
