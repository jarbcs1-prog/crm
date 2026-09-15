import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	isProviderConfigured,
	PROVIDER_NAMES,
	providerEndpoint,
	providerKey,
	providerModel,
	telnyxCallerId,
	twilioCallerId,
} from "../agent/lib/providers";

const KEYS = [
	"OLLAMA_BASE_URL",
	"OLLAMA_MODEL",
	"LMSTUDIO_BASE_URL",
	"LMSTUDIO_MODEL",
	"LLAMA_CPP_BASE_URL",
	"KOBOLD_BASE_URL",
	"KOBOLD_MODEL",
	"OPENCODE_API_URL",
	"OPENCODE_API_KEY",
	"OPENROUTER_API_KEY",
	"OPENROUTER_MODEL",
	"REPLICATE_API_TOKEN",
	"DEEPGRAM_API_KEY",
	"ELEVENLABS_API_KEY",
	"CARTESIA_API_KEY",
	"TWILIO_ACCOUNT_SID",
	"TWILIO_AUTH_TOKEN",
	"TWILIO_CALLER_ID",
	"TELNYX_API_KEY",
	"TELNYX_CALLER_ID",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("provider registry", () => {
	it("covers every local and remote provider", () => {
		expect([...PROVIDER_NAMES].sort()).toEqual(
			[
				"cartesia",
				"deepgram",
				"elevenlabs",
				"kobold",
				"llamacpp",
				"lmstudio",
				"ollama",
				"opencode",
				"openrouter",
				"replicate",
				"telnyx",
				"twilio",
			].sort(),
		);
	});
});

describe("local OpenAI-compatible endpoints", () => {
	it("defaults each server to its loopback", () => {
		expect(providerEndpoint("ollama")).toBe("http://localhost:11434");
		expect(providerEndpoint("lmstudio")).toBe("http://localhost:1234/v1");
		expect(providerEndpoint("kobold")).toBe("http://localhost:5001");
		expect(providerEndpoint("llamacpp")).toBe("http://localhost:8080");
	});

	it("prefers the configured endpoint and model", () => {
		process.env.KOBOLD_BASE_URL = "http://gpu-box:5001";
		process.env.KOBOLD_MODEL = "llama-3.1-8b";

		expect(providerEndpoint("kobold")).toBe("http://gpu-box:5001");
		expect(providerModel("kobold")).toBe("llama-3.1-8b");
	});

	it("treats a set endpoint as configured", () => {
		expect(isProviderConfigured("ollama")).toBe(false);
		process.env.OLLAMA_BASE_URL = "http://localhost:11434";
		expect(isProviderConfigured("ollama")).toBe(true);
	});
});

describe("remote gateways", () => {
	it("needs the key and nothing else", () => {
		expect(isProviderConfigured("openrouter")).toBe(false);
		process.env.OPENROUTER_API_KEY = "key";
		expect(isProviderConfigured("openrouter")).toBe(true);
		expect(providerKey("openrouter")).toBe("key");
	});

	it("reads the optional model and endpoint overrides", () => {
		process.env.OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";
		process.env.OPENCODE_API_URL = "http://runner:8080";

		expect(providerModel("openrouter")).toBe("anthropic/claude-3.5-sonnet");
		expect(providerEndpoint("opencode")).toBe("http://runner:8080");
		expect(providerEndpoint("replicate")).toBeUndefined();
	});
});

describe("voice and dialing vendors", () => {
	it("gates each vendor on its key", () => {
		for (const name of [
			"deepgram",
			"elevenlabs",
			"cartesia",
			"telnyx",
		] as const) {
			expect(isProviderConfigured(name)).toBe(false);
		}
		process.env.DEEPGRAM_API_KEY = "key";
		expect(isProviderConfigured("deepgram")).toBe(true);
		expect(isProviderConfigured("elevenlabs")).toBe(false);
	});

	it("requires the Twilio SID and token together", () => {
		process.env.TWILIO_ACCOUNT_SID = "sid";
		expect(isProviderConfigured("twilio")).toBe(false);
		process.env.TWILIO_AUTH_TOKEN = "token";
		expect(isProviderConfigured("twilio")).toBe(true);
	});

	it("reads caller IDs only when set", () => {
		expect(twilioCallerId()).toBeUndefined();
		expect(telnyxCallerId()).toBeUndefined();
		process.env.TWILIO_CALLER_ID = "+15551234567";
		expect(twilioCallerId()).toBe("+15551234567");
	});

	it("treats blank and whitespace as unset", () => {
		process.env.ELEVENLABS_API_KEY = "   ";
		expect(isProviderConfigured("elevenlabs")).toBe(false);
		expect(providerKey("elevenlabs")).toBeUndefined();
	});
});
