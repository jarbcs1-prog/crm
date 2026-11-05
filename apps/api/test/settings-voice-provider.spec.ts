import { beforeEach, describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { SettingsService } from "../src/settings/settings.service";

const saved = {
	NONOH_SIP_SERVER: process.env.NONOH_SIP_SERVER,
	NONOH_USERNAME: process.env.NONOH_USERNAME,
	NONOH_PASSWORD: process.env.NONOH_PASSWORD,
	VOIPSTUDIO_API_KEY: process.env.VOIPSTUDIO_API_KEY,
	TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
	TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
	TWILIO_CALLER_ID: process.env.TWILIO_CALLER_ID,
	TWILIO_TWIML_URL: process.env.TWILIO_TWIML_URL,
	TWILIO_TWIML: process.env.TWILIO_TWIML,
	PLIVO_AUTH_ID: process.env.PLIVO_AUTH_ID,
	PLIVO_AUTH_TOKEN: process.env.PLIVO_AUTH_TOKEN,
	PLIVO_CALLER_ID: process.env.PLIVO_CALLER_ID,
	PLIVO_ANSWER_URL: process.env.PLIVO_ANSWER_URL,
	VAPI_API_KEY: process.env.VAPI_API_KEY,
	VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
};

beforeEach(() => {
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	delete process.env.NONOH_SIP_SERVER;
	delete process.env.NONOH_USERNAME;
	delete process.env.NONOH_PASSWORD;
	delete process.env.VOIPSTUDIO_API_KEY;
	delete process.env.TWILIO_ACCOUNT_SID;
	delete process.env.TWILIO_AUTH_TOKEN;
	delete process.env.TWILIO_CALLER_ID;
	delete process.env.TWILIO_TWIML_URL;
	delete process.env.TWILIO_TWIML;
	delete process.env.PLIVO_AUTH_ID;
	delete process.env.PLIVO_AUTH_TOKEN;
	delete process.env.PLIVO_CALLER_ID;
	delete process.env.PLIVO_ANSWER_URL;
	delete process.env.VAPI_API_KEY;
	delete process.env.VAPI_PHONE_NUMBER_ID;
});

function makeService(
	role: string | null = "owner",
	provider: string | null = null,
) {
	let row: { voiceProvider: string | null; updatedAt: Date } = {
		voiceProvider: provider,
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	};
	const seen: Record<string, unknown> = {};
	const db = {
		appSetting: {
			findUnique: async (args: unknown) => {
				seen.findUnique = args;
				return row;
			},
			upsert: async (args: unknown) => {
				seen.upsert = args;
				const value = args as { create?: { voiceProvider?: string | null } };
				row = { ...row, voiceProvider: value.create?.voiceProvider ?? null };
				return row;
			},
		},
		member: {
			findUnique: async () => (role ? { role } : null),
		},
	} as unknown as Db;
	const catalog = {
		models: async () => [],
		find: async () => null,
	} as never;
	return { service: new SettingsService(db, catalog), seen };
}

describe("SettingsService voice providers", () => {
	it("returns every provider with configuration status", async () => {
		process.env.VOIPSTUDIO_API_KEY = "key";
		const { service } = makeService();
		const result = await service.voiceProvider("user-1");
		expect(result.selectedId).toBeNull();
		expect(result.invalid).toBe(false);
		expect(result.canConfigure).toBe(true);
		expect(result.options.map((option) => option.id)).toEqual([
			"nonoh",
			"voipstudio",
			"twilio",
			"plivo",
			"vapi",
		]);
		expect(
			result.options.find((option) => option.id === "voipstudio")?.configured,
		).toBe(true);
		expect(
			result.options.find((option) => option.id === "twilio")?.configured,
		).toBe(false);
	});

	it("reports members as read-only", async () => {
		const { service } = makeService("member");
		const result = await service.voiceProvider("user-1");
		expect(result.canConfigure).toBe(false);
	});

	it("fails closed for an unknown persisted provider", async () => {
		const { service } = makeService("owner", "unknown");
		const result = await service.voiceProvider("user-1");
		expect(result.selectedId).toBeNull();
		expect(result.invalid).toBe(true);
	});

	it("allows an admin to save a provider default", async () => {
		const { service, seen } = makeService();
		const result = await service.setVoiceProvider("voipstudio", "user-1");
		expect(result.selectedId).toBe("voipstudio");
		expect(seen.upsert).toMatchObject({
			create: { id: "app", voiceProvider: "voipstudio" },
		});
	});

	it("rejects a non-admin", async () => {
		const { service } = makeService("member");
		expect(service.setVoiceProvider("voipstudio", "user-1")).rejects.toThrow(
			"Only an owner or an admin",
		);
	});
});
