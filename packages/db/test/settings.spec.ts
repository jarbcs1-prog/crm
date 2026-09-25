import { describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import {
	readVoiceProviderState,
	VOICE_PROVIDERS,
	voiceProviderConfigured,
	writeVoiceProvider,
} from "../src/settings";

function dbWith(row: { voiceProvider?: string | null } | null) {
	const seen: Record<string, unknown> = {};
	const db = {
		appSetting: {
			findUnique: async (args: unknown) => {
				seen.findUnique = args;
				return row;
			},
			upsert: async (args: unknown) => {
				seen.upsert = args;
				return {};
			},
		},
	} as unknown as Db;
	return { db, seen };
}

describe("voice provider settings", () => {
	it("keeps the supported provider set stable", () => {
		expect(VOICE_PROVIDERS).toEqual([
			"nonoh",
			"voipstudio",
			"twilio",
			"plivo",
			"vapi",
		]);
	});

	it("returns a valid automatic state when no human default is stored", async () => {
		const { db } = dbWith(null);
		expect(await readVoiceProviderState(db)).toEqual({
			selectedId: null,
			valid: true,
		});
	});

	it("reads a stored provider", async () => {
		const { db } = dbWith({ voiceProvider: "voipstudio" });
		expect(await readVoiceProviderState(db)).toEqual({
			selectedId: "voipstudio",
			valid: true,
		});
	});

	it("keeps an unknown stored provider invalid", async () => {
		const { db } = dbWith({ voiceProvider: "unknown" });
		expect(await readVoiceProviderState(db)).toEqual({
			selectedId: null,
			valid: false,
		});
	});

	it("uses the same complete readiness contract as the dialers", () => {
		expect(
			voiceProviderConfigured("twilio", {
				TWILIO_ACCOUNT_SID: "AC1",
				TWILIO_AUTH_TOKEN: "token",
				TWILIO_CALLER_ID: "+15550001111",
			}),
		).toBe(false);
		expect(
			voiceProviderConfigured("twilio", {
				TWILIO_ACCOUNT_SID: "AC1",
				TWILIO_AUTH_TOKEN: "token",
				TWILIO_CALLER_ID: "+15550001111",
				TWILIO_TWIML_URL: "https://example.test/twiml",
			}),
		).toBe(true);
		expect(
			voiceProviderConfigured("nonoh", {
				NONOH_SIP_SERVER: "sip.example.test",
				NONOH_USERNAME: "user",
			}),
		).toBe(false);
		expect(
			voiceProviderConfigured("nonoh", {
				NONOH_SIP_SERVER: "sip.example.test",
				NONOH_USERNAME: "user",
				NONOH_PASSWORD: "password",
			}),
		).toBe(true);
		expect(voiceProviderConfigured("voipstudio", {})).toBe(false);
		expect(voiceProviderConfigured("voipstudio", { VOIPSTUDIO_API_KEY: "key" })).toBe(
			true,
		);
		expect(
			voiceProviderConfigured("plivo", {
				PLIVO_AUTH_ID: "MA1",
				PLIVO_AUTH_TOKEN: "token",
			}),
		).toBe(false);
		expect(
			voiceProviderConfigured("plivo", {
				PLIVO_AUTH_ID: "MA1",
				PLIVO_AUTH_TOKEN: "token",
				PLIVO_CALLER_ID: "+15550001111",
				PLIVO_ANSWER_URL: "https://example.test/answer",
			}),
		).toBe(true);
		expect(voiceProviderConfigured("vapi", { VAPI_API_KEY: "key" })).toBe(false);
		expect(
			voiceProviderConfigured("vapi", {
				VAPI_API_KEY: "key",
				VAPI_PHONE_NUMBER_ID: "phone",
			}),
		).toBe(true);
	});

	it("writes the selected provider without changing model settings", async () => {
		const { db, seen } = dbWith(null);
		await writeVoiceProvider(db, "twilio");
		expect(seen.upsert).toEqual({
			where: { id: "app" },
			create: { id: "app", voiceProvider: "twilio" },
			update: { voiceProvider: "twilio" },
		});
	});
});
