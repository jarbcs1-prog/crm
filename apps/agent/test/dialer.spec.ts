import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CallStatus } from "@crm/db";
import {
	dialerFor,
	dialers,
	hangupCall,
	plivoConfigured,
	providerStatus,
	selectDialer,
	twilioConfigured,
	vapiConfigured,
	voipstudioConfigured,
} from "../agent/lib/dialer";
import loadPitch from "../agent/tools/load_pitch";
import makeCall from "../agent/tools/make_call";

const KEYS = [
	"NONOH_SIP_SERVER",
	"NONOH_USERNAME",
	"NONOH_PASSWORD",
	"TWILIO_ACCOUNT_SID",
	"TWILIO_AUTH_TOKEN",
	"TWILIO_CALLER_ID",
	"TWILIO_TWIML_URL",
	"TWILIO_TWIML",
	"PLIVO_AUTH_ID",
	"PLIVO_AUTH_TOKEN",
	"PLIVO_CALLER_ID",
	"PLIVO_ANSWER_URL",
	"VAPI_API_KEY",
	"VAPI_PHONE_NUMBER_ID",
	"VAPI_ASSISTANT_ID",
	"VOIPSTUDIO_API_KEY",
	"VOIPSTUDIO_CALLER_ID",
	"VOIPSTUDIO_BASE_URL",
] as const;

const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit }> = [];

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	calls = [];
	globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(JSON.stringify({}), { status: 200 });
	}) as typeof fetch;
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
	globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, status = 200): void {
	globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(JSON.stringify(body), { status });
	}) as typeof fetch;
}

describe("provider capability gates", () => {
	it("selects nothing on a bare install", () => {
		expect(selectDialer()).toBeNull();
		expect(twilioConfigured()).toBe(false);
		expect(plivoConfigured()).toBe(false);
		expect(vapiConfigured()).toBe(false);
		expect(voipstudioConfigured()).toBe(false);
	});

	it("keeps all five providers selectable and prefers an explicit choice", () => {
		process.env.VOIPSTUDIO_API_KEY = "key";
		process.env.TWILIO_ACCOUNT_SID = "AC123";
		process.env.TWILIO_AUTH_TOKEN = "tok";
		process.env.TWILIO_CALLER_ID = "+15550001111";
		process.env.TWILIO_TWIML_URL = "https://example.test/twiml";
		expect(dialers().map((dialer) => dialer.name)).toEqual([
			"nonoh",
			"voipstudio",
			"twilio",
			"plivo",
			"vapi",
		]);
		expect(selectDialer("voipstudio")?.name).toBe("voipstudio");
		expect(selectDialer("twilio")?.name).toBe("twilio");
	});

	it("does not silently fall back when an explicit provider is unconfigured", () => {
		process.env.TWILIO_ACCOUNT_SID = "AC123";
		process.env.TWILIO_AUTH_TOKEN = "tok";
		process.env.TWILIO_CALLER_ID = "+15550001111";
		process.env.TWILIO_TWIML_URL = "https://example.test/twiml";
		expect(selectDialer("voipstudio")).toBeNull();
		expect(selectDialer()?.name).toBe("twilio");
	});

	it("treats partial Twilio keys as unconfigured", () => {
		process.env.TWILIO_ACCOUNT_SID = "ACx";
		expect(twilioConfigured()).toBe(false);
	});
});

describe("twilio dialer", () => {
	beforeEach(() => {
		process.env.TWILIO_ACCOUNT_SID = "AC123";
		process.env.TWILIO_AUTH_TOKEN = "tok";
		process.env.TWILIO_CALLER_ID = "+15550001111";
		process.env.TWILIO_TWIML_URL = "https://example.com/twiml";
	});

	it("posts form-encoded with basic auth and returns the call sid queued", async () => {
		jsonResponse({ sid: "CA999" }, 201);
		const result = await dialerFor("twilio").placeCall("+15552223333");
		expect(result.ok).toBe(true);
		expect(result.providerCallId).toBe("CA999");
		expect(result.queued).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(
			"https://api.twilio.com/2010-04-01/Accounts/AC123/Calls.json",
		);
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers.Authorization).toStartWith("Basic ");
		const body = new URLSearchParams(String(calls[0]?.init.body));
		expect(body.get("To")).toBe("+15552223333");
		expect(body.get("From")).toBe("+15550001111");
		expect(body.get("Url")).toBe("https://example.com/twiml");
	});

	it("refuses without call instructions and places no call", async () => {
		delete process.env.TWILIO_TWIML_URL;
		const result = await dialerFor("twilio").placeCall("+15552223333");
		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it("hangs up by completing the call", async () => {
		jsonResponse({});
		const hung = await dialerFor("twilio").hangup("CA999");
		expect(hung.ok).toBe(true);
		const body = new URLSearchParams(String(calls[0]?.init.body));
		expect(body.get("Status")).toBe("completed");
	});
});

describe("plivo dialer", () => {
	beforeEach(() => {
		process.env.PLIVO_AUTH_ID = "MA123";
		process.env.PLIVO_AUTH_TOKEN = "tok";
		process.env.PLIVO_CALLER_ID = "+15550001111";
		process.env.PLIVO_ANSWER_URL = "https://example.com/answer";
	});

	it("posts json with basic auth and returns the request uuid queued", async () => {
		jsonResponse({ request_uuid: "req-1" });
		const result = await dialerFor("plivo").placeCall("+15552223333");
		expect(result.ok).toBe(true);
		expect(result.providerCallId).toBe("req-1");
		expect(result.queued).toBe(true);
		expect(calls[0]?.url).toBe("https://api.plivo.com/v1/Account/MA123/Call/");
		const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, string>;
		expect(body.to).toBe("+15552223333");
		expect(body.answer_url).toBe("https://example.com/answer");
	});

	it("refuses without an answer url and places no call", async () => {
		delete process.env.PLIVO_ANSWER_URL;
		const result = await dialerFor("plivo").placeCall("+15552223333");
		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
});

describe("vapi dialer", () => {
	beforeEach(() => {
		process.env.VAPI_API_KEY = "key";
		process.env.VAPI_PHONE_NUMBER_ID = "pn-1";
		process.env.VAPI_ASSISTANT_ID = "as-1";
	});

	it("posts bearer auth with the assistant id and returns the call id queued", async () => {
		jsonResponse({ id: "call-1" });
		const result = await dialerFor("vapi").placeCall("+15552223333");
		expect(result.ok).toBe(true);
		expect(result.providerCallId).toBe("call-1");
		expect(result.queued).toBe(true);
		expect(calls[0]?.url).toBe("https://api.vapi.ai/call/phone");
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer key");
		const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
		expect(body.assistantId).toBe("as-1");
		expect(body).toMatchObject({ customer: { number: "+15552223333" } });
	});

	it("accepts an inline assistant from load_pitch", async () => {
		jsonResponse({ id: "call-2" });
		delete process.env.VAPI_ASSISTANT_ID;
		const assistant = { model: { provider: "openai", model: "gpt-4o-mini" } };
		const result = await dialerFor("vapi").placeCall("+15552223333", { assistant });
		expect(result.ok).toBe(true);
		const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
		expect(body.assistant).toEqual(assistant);
	});

	it("refuses without a phone number id and places no call", async () => {
		delete process.env.VAPI_PHONE_NUMBER_ID;
		const result = await dialerFor("vapi").placeCall("+15552223333");
		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it("stops a call through the Vapi control endpoint", async () => {
		jsonResponse({});
		const result = await dialerFor("vapi").hangup("call-1");
		expect(result.ok).toBe(true);
		expect(calls[0]?.url).toBe("https://api.vapi.ai/call/call-1/stop");
		expect(calls[0]?.init.method).toBe("POST");
	});
});

describe("voipstudio dialer", () => {
	beforeEach(() => {
		process.env.VOIPSTUDIO_API_KEY = "key";
		process.env.VOIPSTUDIO_CALLER_ID = "+15550001111";
	});

	it("posts the caller id with the configured API token and returns the call id", async () => {
		jsonResponse({ data: { id: "vs-1" } }, 201);
		const result = await dialerFor("voipstudio").placeCall("+15552223333");
		expect(result.ok).toBe(true);
		expect(result.providerCallId).toBe("vs-1");
		expect(result.queued).toBe(true);
		expect(calls[0]?.url).toBe("https://l7api.com/v1.2/voipstudio/calls");
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers["X-Auth-Token"]).toBe("key");
		const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, string>;
		expect(body).toEqual({ to: "+15552223333", caller_id: "+15550001111" });
	});

	it("hangs up through the VoIPStudio calls endpoint", async () => {
		jsonResponse({});
		const result = await dialerFor("voipstudio").hangup("vs-1");
		expect(result.ok).toBe(true);
		expect(calls[0]?.url).toBe("https://l7api.com/v1.2/voipstudio/calls/vs-1");
		expect(calls[0]?.init.method).toBe("DELETE");
	});
});

describe("hangup routing", () => {
	it("routes by the provider recorded in call meta", async () => {
		process.env.TWILIO_ACCOUNT_SID = "AC123";
		process.env.TWILIO_AUTH_TOKEN = "tok";
		process.env.TWILIO_CALLER_ID = "+15550001111";
		jsonResponse({});
		const hung = await hangupCall({ provider: "twilio" }, "CA999");
		expect(hung.ok).toBe(true);
		expect(calls[0]?.url).toContain("/Calls/CA999.json");
	});

	it("routes VoIP Studio hangups by call meta", async () => {
		process.env.VOIPSTUDIO_API_KEY = "key";
		jsonResponse({});
		const hung = await hangupCall({ provider: "voipstudio" }, "vs-1");
		expect(hung.ok).toBe(true);
		expect(calls[0]?.url).toBe("https://l7api.com/v1.2/voipstudio/calls/vs-1");
		expect(calls[0]?.init.method).toBe("DELETE");
	});

	it("fails closed when provider metadata is missing or invalid", async () => {
		const missing = await hangupCall({}, "legacy-1");
		const invalid = await hangupCall({ provider: "unknown" }, "legacy-2");
		expect(missing).toEqual({
			ok: false,
			reason: "Call has no valid provider metadata; refusing to guess how to hang it up.",
		});
		expect(invalid).toEqual(missing);
		expect(calls).toHaveLength(0);
	});
});

describe("hosted provider status", () => {
	it("reads Twilio status through the account endpoint", async () => {
		process.env.TWILIO_ACCOUNT_SID = "AC123";
		process.env.TWILIO_AUTH_TOKEN = "token";
		jsonResponse({ status: "in-progress" });
		const result = await providerStatus("twilio", "CA123");
		expect(result.ok).toBe(true);
		expect(result.code?.status).toBe(CallStatus.IN_PROGRESS);
		expect(calls[0]?.url).toBe(
			"https://api.twilio.com/2010-04-01/Accounts/AC123/Calls/CA123.json",
		);
	});

	it("reads Plivo status through the account endpoint", async () => {
		process.env.PLIVO_AUTH_ID = "MA123";
		process.env.PLIVO_AUTH_TOKEN = "token";
		jsonResponse({ status: "completed" });
		const result = await providerStatus("plivo", "request-123");
		expect(result.ok).toBe(true);
		expect(result.code?.status).toBe(CallStatus.COMPLETED);
		expect(calls[0]?.url).toBe(
			"https://api.plivo.com/v1/Account/MA123/Call/request-123/",
		);
	});

	it("reads Vapi status through its bearer-authenticated endpoint", async () => {
		process.env.VAPI_API_KEY = "key";
		jsonResponse({ status: "busy" });
		const result = await providerStatus("vapi", "call-123");
		expect(result.ok).toBe(true);
		expect(result.code?.status).toBe(CallStatus.BUSY);
		expect(calls[0]?.url).toBe("https://api.vapi.ai/call/call-123");
	});

	it("reads VoIP Studio status through its API-token endpoint", async () => {
		process.env.VOIPSTUDIO_API_KEY = "key";
		jsonResponse({ data: { status: "ringing" } });
		const result = await providerStatus("voipstudio", "vs-123");
		expect(result.ok).toBe(true);
		expect(result.code?.status).toBe(CallStatus.RINGING);
		expect(calls[0]?.url).toBe(
			"https://l7api.com/v1.2/voipstudio/calls/vs-123",
		);
	});
});

describe("tool surface stability", () => {
	it("make_call keeps its input schema with keys but no provider", () => {
		const shape = (makeCall.inputSchema as unknown as { shape: Record<string, unknown> })
			.shape;
		expect(Object.keys(shape).sort()).toEqual(
			["assistant", "contactId", "phone", "provider", "requiresOsintCheck"].sort(),
		);
	});
});

describe("load_pitch vapi render", () => {
	it("renders one assistant message per segment for the conversation pitch", async () => {
		const loaded = (await loadPitch.execute(
			{ pitchId: "scam-recovery-v2.1" },
			{},
		)) as {
			segments: Array<{ text: string }>;
			vapi: { messages: Array<{ role: string; content: string }> };
		};
		expect(loaded.segments.length).toBeGreaterThan(0);
		expect(loaded.vapi.messages).toHaveLength(loaded.segments.length);
		expect(
			loaded.vapi.messages.every((message) => message.role === "assistant"),
		).toBe(true);
		expect(loaded.vapi.messages[0]?.content).toBe(loaded.segments[0]?.text);
	});
});
