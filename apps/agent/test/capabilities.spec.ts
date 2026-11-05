import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	capabilities,
	capabilitiesMarkdown,
	enabled,
	unavailable,
} from "../agent/lib/capabilities";

const KEYS = [
	"RAPIDAPI_KEY",
	"TAVILY_API_KEY",
	"EXA_API_KEY",
	"BRAVE_API_KEY",
	"FIRECRAWL_API_KEY",
	"GOOGLE_API_KEY",
	"GOOGLE_CSE_ID",
	"CONTEXT_DEV_API_KEY",
	"BLOB_READ_WRITE_TOKEN",
	"NONOH_SIP_SERVER",
	"NONOH_USERNAME",
	"NONOH_PASSWORD",
	"VOIPSTUDIO_API_KEY",
	"OLLAMA_BASE_URL",
	"LMSTUDIO_BASE_URL",
	"LLAMA_CPP_BASE_URL",
	"KOBOLD_BASE_URL",
	"OPENCODE_API_KEY",
	"OPENROUTER_API_KEY",
	"REPLICATE_API_TOKEN",
	"DEEPGRAM_API_KEY",
	"ELEVENLABS_API_KEY",
	"CARTESIA_API_KEY",
	"VAPI_API_KEY",
	"VAPI_PHONE_NUMBER_ID",
	"PLIVO_AUTH_ID",
	"PLIVO_AUTH_TOKEN",
	"PLIVO_CALLER_ID",
	"PLIVO_ANSWER_URL",
	"TWILIO_ACCOUNT_SID",
	"TWILIO_AUTH_TOKEN",
	"TWILIO_CALLER_ID",
	"TWILIO_TWIML_URL",
	"TWILIO_TWIML",
	"TELNYX_API_KEY",
	"FASTER_WHISPER_URL",
	"QDRANT_URL",
	"QDRANT_API_KEY",
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

describe("capabilities", () => {
	it("reports keyed capabilities off but DuckDuckGo always on, on a bare install", () => {
		const keyed = capabilities().filter((c) => c.env !== "DUCKDUCKGO");
		expect(keyed.every((c) => !c.enabled)).toBe(true);
		expect(enabled("DUCKDUCKGO")).toBe(true);
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("turns one on without turning on the others", () => {
		process.env.TAVILY_API_KEY = "tavily-test";

		expect(enabled("TAVILY_API_KEY")).toBe(true);
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("uses complete readiness for hosted voice providers", () => {
		process.env.VAPI_API_KEY = "key";
		expect(enabled("VAPI_API_KEY")).toBe(false);
		process.env.VAPI_PHONE_NUMBER_ID = "phone";
		expect(enabled("VAPI_API_KEY")).toBe(true);

		process.env.TWILIO_ACCOUNT_SID = "AC1";
		process.env.TWILIO_AUTH_TOKEN = "token";
		process.env.TWILIO_CALLER_ID = "+15550001111";
		expect(enabled("TWILIO_ACCOUNT_SID")).toBe(false);
		process.env.TWILIO_TWIML_URL = "https://example.test/twiml";
		expect(enabled("TWILIO_ACCOUNT_SID")).toBe(true);
	});
	it("treats blank and whitespace as unset", () => {
		process.env.RAPIDAPI_KEY = "   ";
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("is read live, so a late-configured process is not stuck off", () => {
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
		process.env.RAPIDAPI_KEY = "key";
		expect(enabled("RAPIDAPI_KEY")).toBe(true);
	});

	it("is unknown for a variable that is not a capability", () => {
		process.env.SOMETHING_ELSE = "x";
		expect(enabled("SOMETHING_ELSE")).toBe(false);
		delete process.env.SOMETHING_ELSE;
	});
});

describe("the unavailable result", () => {
	it("says retrying will not help", () => {
		const result = unavailable("RAPIDAPI_KEY");

		expect(result.ok).toBe(false);
		expect(result.configured).toBe(false);
		expect(result.reason).toContain("retrying will not help");
		expect(result.reason).toContain("RAPIDAPI_KEY");
	});
});

describe("the capability briefing", () => {
	it("lists DuckDuckGo as available on a bare install and keyed sources as not configured", () => {
		const markdown = capabilitiesMarkdown();

		expect(markdown).toContain("DuckDuckGo");
		expect(markdown).toContain("Not configured here");
		expect(markdown).toContain("LinkedIn");
	});

	it("lists what is on and what is off, separately", () => {
		process.env.RAPIDAPI_KEY = "key";
		process.env.TAVILY_API_KEY = "key";
		const markdown = capabilitiesMarkdown();

		expect(markdown).toContain("Available:");
		expect(markdown).toContain("LinkedIn");
		expect(markdown).toContain("Not configured here");
		expect(markdown).toContain("Web research");
	});

	it("does not warn about missing sources when everything is on", () => {
		for (const key of KEYS) process.env[key] = "key";

		expect(capabilitiesMarkdown()).not.toContain("Not configured here");
	});
});
