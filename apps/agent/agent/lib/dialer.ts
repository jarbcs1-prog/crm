import {
	type VoiceProvider as StoredVoiceProvider,
	voiceProviderConfigured,
} from "@crm/db/settings";
import { CallSession, getSession } from "./telephony/session";
import { type CallCode, callCode } from "./voice";

export type VoiceProvider = StoredVoiceProvider;

export interface ProviderDialResult {
	ok: boolean;
	providerCallId?: string;
	status?: number;
	reason?: string;
	queued?: boolean;
	note?: string;
}

export interface VoiceDialer {
	readonly name: VoiceProvider;
	isConfigured(): boolean;
	placeCall(toE164: string, opts?: { assistant?: unknown }): Promise<ProviderDialResult>;
	hangup(providerCallId: string): Promise<{ ok: boolean; reason?: string }>;
}

function required(key: string): string | undefined {
	const value = process.env[key]?.trim();
	return value && value.length > 0 ? value : undefined;
}

export function twilioConfigured(): boolean {
	return voiceProviderConfigured("twilio");
}

export function plivoConfigured(): boolean {
	return voiceProviderConfigured("plivo");
}

export function vapiConfigured(): boolean {
	return voiceProviderConfigured("vapi");
}

export function voipstudioConfigured(): boolean {
	return voiceProviderConfigured("voipstudio");
}

function basicAuth(user: string, pass: string): string {
	return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function readErrorText(response: Response): Promise<string> {
	try {
		const text = await response.text();
		return text.slice(0, 300);
	} catch {
		return `HTTP ${response.status}`;
	}
}

class NonohDialer implements VoiceDialer {
	readonly name = "nonoh" as const;

	isConfigured(): boolean {
		return voiceProviderConfigured("nonoh");
	}

	async placeCall(toE164: string): Promise<ProviderDialResult> {
		const dialed = await CallSession.dial(toE164);
		if (!dialed.ok || !dialed.session) {
			return {
				ok: false,
				status: dialed.status,
				reason: dialed.reason ?? "The call could not be placed.",
			};
		}
		return {
			ok: true,
			providerCallId: dialed.session.sipCallId,
		};
	}

	async hangup(providerCallId: string): Promise<{ ok: boolean; reason?: string }> {
		const session =
			getSession(providerCallId) ?? getSession(`nonoh:${providerCallId}`);
		if (!session) return { ok: false, reason: "No live Nonoh session." };
		await session.hangup();
		return { ok: true };
	}
}

class VoipStudioDialer implements VoiceDialer {
	readonly name = "voipstudio" as const;

	isConfigured(): boolean {
		return voipstudioConfigured();
	}

	async placeCall(toE164: string): Promise<ProviderDialResult> {
		const key = required("VOIPSTUDIO_API_KEY");
		if (!key) return { ok: false, reason: "VoIP Studio dialing needs VOIPSTUDIO_API_KEY." };
		const baseUrl = (
			required("VOIPSTUDIO_BASE_URL") ?? "https://l7api.com/v1.2/voipstudio"
		).replace(/\/+$/, "");
		const body: Record<string, string> = { to: toE164 };
		const from = required("VOIPSTUDIO_CALLER_ID");
		if (from) body.caller_id = from;
		let response: Response;
		try {
			response = await fetch(`${baseUrl}/calls`, {
				method: "POST",
				headers: {
					"X-Auth-Token": key,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});
		} catch (error) {
			return {
				ok: false,
				reason: `VoIP Studio request failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
		if (!response.ok) {
			return { ok: false, status: response.status, reason: await readErrorText(response) };
		}
		const result = (await response.json()) as {
			data?: { id?: string };
			id?: string;
		};
		const providerCallId = result.data?.id ?? result.id;
		if (!providerCallId) {
			return { ok: false, reason: "VoIP Studio answered without a call id." };
		}
		return {
			ok: true,
			providerCallId,
			queued: true,
			note: "Queued via VoIP Studio; provider events will update the CRM call.",
		};
	}

	async hangup(providerCallId: string): Promise<{ ok: boolean; reason?: string }> {
		const key = required("VOIPSTUDIO_API_KEY");
		if (!key) return { ok: false, reason: "VoIP Studio is not configured." };
		const baseUrl = (
			required("VOIPSTUDIO_BASE_URL") ?? "https://l7api.com/v1.2/voipstudio"
		).replace(/\/+$/, "");
		const response = await fetch(
			`${baseUrl}/calls/${encodeURIComponent(providerCallId)}`,
			{
				method: "DELETE",
				headers: { "X-Auth-Token": key },
			},
		);
		if (!response.ok) {
			return { ok: false, reason: await readErrorText(response) };
		}
		return { ok: true };
	}
}

class TwilioDialer implements VoiceDialer {
	readonly name = "twilio" as const;

	isConfigured(): boolean {
		return twilioConfigured();
	}

	async placeCall(toE164: string): Promise<ProviderDialResult> {
		const sid = required("TWILIO_ACCOUNT_SID");
		const token = required("TWILIO_AUTH_TOKEN");
		const from = required("TWILIO_CALLER_ID");
		if (!sid || !token || !from) {
			return {
				ok: false,
				reason:
					"Twilio dialing needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_CALLER_ID set together.",
			};
		}
		const twimlUrl = required("TWILIO_TWIML_URL");
		const twiml = required("TWILIO_TWIML");
		if (!twimlUrl && !twiml) {
			return {
				ok: false,
				reason:
					"Twilio dialing needs call instructions: set TWILIO_TWIML_URL or TWILIO_TWIML. No call was placed.",
			};
		}
		const form = new URLSearchParams({ To: toE164, From: from });
		if (twimlUrl) form.set("Url", twimlUrl);
		else if (twiml) form.set("Twiml", twiml);
		let response: Response;
		try {
			response = await fetch(
				`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
				{
					method: "POST",
					headers: {
						Authorization: basicAuth(sid, token),
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: form.toString(),
				},
			);
		} catch (error) {
			return {
				ok: false,
				reason: `Twilio request failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
		if (!response.ok) {
			return { ok: false, status: response.status, reason: await readErrorText(response) };
		}
		const body = (await response.json()) as { sid?: string };
		if (!body.sid) return { ok: false, reason: "Twilio answered without a call SID." };
		return {
			ok: true,
			providerCallId: body.sid,
			queued: true,
			note: "Queued with the provider; lifecycle events update the CRM asynchronously.",
		};
	}

	async hangup(providerCallId: string): Promise<{ ok: boolean; reason?: string }> {
		const sid = required("TWILIO_ACCOUNT_SID");
		const token = required("TWILIO_AUTH_TOKEN");
		if (!sid || !token) return { ok: false, reason: "Twilio is not configured." };
		const response = await fetch(
			`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${providerCallId}.json`,
			{
				method: "POST",
				headers: {
					Authorization: basicAuth(sid, token),
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ Status: "completed" }).toString(),
			},
		);
		if (!response.ok) {
			return { ok: false, reason: await readErrorText(response) };
		}
		return { ok: true };
	}
}

class PlivoDialer implements VoiceDialer {
	readonly name = "plivo" as const;

	isConfigured(): boolean {
		return plivoConfigured();
	}

	async placeCall(toE164: string): Promise<ProviderDialResult> {
		const authId = required("PLIVO_AUTH_ID");
		const token = required("PLIVO_AUTH_TOKEN");
		if (!authId || !token) {
			return {
				ok: false,
				reason: "Plivo dialing needs PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN set together.",
			};
		}
		const answerUrl = required("PLIVO_ANSWER_URL");
		if (!answerUrl) {
			return {
				ok: false,
				reason: "Plivo dialing needs PLIVO_ANSWER_URL call instructions. No call was placed.",
			};
		}
		const from = required("PLIVO_CALLER_ID") ?? required("TWILIO_CALLER_ID");
		if (!from) {
			return {
				ok: false,
				reason: "Plivo dialing needs PLIVO_CALLER_ID (or TWILIO_CALLER_ID). No call was placed.",
			};
		}
		let response: Response;
		try {
			response = await fetch(`https://api.plivo.com/v1/Account/${authId}/Call/`, {
				method: "POST",
				headers: {
					Authorization: basicAuth(authId, token),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ to: toE164, from, answer_url: answerUrl }),
			});
		} catch (error) {
			return {
				ok: false,
				reason: `Plivo request failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
		if (!response.ok) {
			return { ok: false, status: response.status, reason: await readErrorText(response) };
		}
		const body = (await response.json()) as { request_uuid?: string };
		if (!body.request_uuid) return { ok: false, reason: "Plivo answered without a request UUID." };
		return {
			ok: true,
			providerCallId: body.request_uuid,
			queued: true,
			note: "Queued with the provider; lifecycle events update the CRM asynchronously.",
		};
	}

	async hangup(providerCallId: string): Promise<{ ok: boolean; reason?: string }> {
		const authId = required("PLIVO_AUTH_ID");
		const token = required("PLIVO_AUTH_TOKEN");
		if (!authId || !token) return { ok: false, reason: "Plivo is not configured." };
		const response = await fetch(
			`https://api.plivo.com/v1/Account/${authId}/Call/${providerCallId}/`,
			{
				method: "DELETE",
				headers: { Authorization: basicAuth(authId, token) },
			},
		);
		if (!response.ok) {
			return { ok: false, reason: await readErrorText(response) };
		}
		return { ok: true };
	}
}

class VapiDialer implements VoiceDialer {
	readonly name = "vapi" as const;

	isConfigured(): boolean {
		return vapiConfigured();
	}

	async placeCall(
		toE164: string,
		opts?: { assistant?: unknown },
	): Promise<ProviderDialResult> {
		const key = required("VAPI_API_KEY");
		if (!key) return { ok: false, reason: "Vapi dialing needs VAPI_API_KEY." };
		const phoneNumberId = required("VAPI_PHONE_NUMBER_ID");
		if (!phoneNumberId) {
			return {
				ok: false,
				reason: "Vapi dialing needs VAPI_PHONE_NUMBER_ID. No call was placed.",
			};
		}
		const assistant = opts?.assistant ?? assistantFromEnv();
		if (!assistant) {
			return {
				ok: false,
				reason:
					"Vapi dialing needs an assistant: pass one from load_pitch or set VAPI_ASSISTANT_ID. No call was placed.",
			};
		}
		let response: Response;
		try {
			response = await fetch("https://api.vapi.ai/call/phone", {
				method: "POST",
				headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
				body: JSON.stringify({
					phoneNumberId,
					customer: { number: toE164 },
					...(typeof assistant === "string"
						? { assistantId: assistant }
						: { assistant }),
				}),
			});
		} catch (error) {
			return {
				ok: false,
				reason: `Vapi request failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
		if (!response.ok) {
			return { ok: false, status: response.status, reason: await readErrorText(response) };
		}
		const body = (await response.json()) as { id?: string };
		if (!body.id) return { ok: false, reason: "Vapi answered without a call id." };
		return {
			ok: true,
			providerCallId: body.id,
			queued: true,
			note: "Queued via Vapi; the assistant runs on Vapi's infrastructure, not the local SIP session.",
		};
	}

	async hangup(providerCallId: string): Promise<{ ok: boolean; reason?: string }> {
		const key = required("VAPI_API_KEY");
		if (!key) return { ok: false, reason: "Vapi is not configured." };
		const response = await fetch(
			`https://api.vapi.ai/call/${providerCallId}/stop`,
			{
				method: "POST",
				headers: { Authorization: `Bearer ${key}` },
			},
		);
		if (!response.ok) {
			return { ok: false, reason: await readErrorText(response) };
		}
		return { ok: true };
	}
}

function assistantFromEnv(): string | undefined {
	return required("VAPI_ASSISTANT_ID");
}

const nonoh = new NonohDialer();
const voipstudio = new VoipStudioDialer();
const twilio = new TwilioDialer();
const plivo = new PlivoDialer();
const vapi = new VapiDialer();

const ALL: readonly VoiceDialer[] = [nonoh, voipstudio, twilio, plivo, vapi];

export function dialers(): readonly VoiceDialer[] {
	return ALL;
}

export function dialerFor(name: VoiceProvider): VoiceDialer {
	switch (name) {
		case "voipstudio":
			return voipstudio;
		case "twilio":
			return twilio;
		case "plivo":
			return plivo;
		case "vapi":
			return vapi;
		case "nonoh":
			return nonoh;
	}
}

export function selectDialer(preferred?: VoiceProvider | null): VoiceDialer | null {
	if (preferred) {
		const dialer = dialerFor(preferred);
		return dialer.isConfigured() ? dialer : null;
	}
	for (const dialer of ALL) {
		if (dialer.isConfigured()) return dialer;
	}
	return null;
}

export function providerFromMeta(meta: unknown): VoiceProvider | null {
	if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return null;
	const provider = (meta as Record<string, unknown>).provider;
	return provider === "nonoh" ||
		provider === "voipstudio" ||
		provider === "twilio" ||
		provider === "plivo" ||
		provider === "vapi"
		? provider
		: null;
}

export interface ProviderStatusResult {
	ok: boolean;
	code?: CallCode;
	reason?: string;
}

function providerState(body: Record<string, unknown>): string | number | null {
	const data =
		typeof body.data === "object" && body.data !== null
			? (body.data as Record<string, unknown>)
			: null;
	const value = data?.status ?? data?.state ?? body.status ?? body.state;
	return typeof value === "string" || typeof value === "number" ? value : null;
}

export async function providerStatus(
	provider: VoiceProvider,
	providerCallId: string,
): Promise<ProviderStatusResult> {
	const id = providerCallId.trim();
	if (!id) return { ok: false, reason: "Provider call id is missing." };
	if (provider === "nonoh") {
		return { ok: false, reason: "Nonoh status comes from its local SIP session." };
	}

	let url: string;
	let init: RequestInit;
	switch (provider) {
		case "voipstudio": {
			const key = required("VOIPSTUDIO_API_KEY");
			if (!key) return { ok: false, reason: "VoIP Studio is not configured." };
			const base = (
				required("VOIPSTUDIO_BASE_URL") ?? "https://l7api.com/v1.2/voipstudio"
			).replace(/\/+$/, "");
			url = `${base}/calls/${encodeURIComponent(id)}`;
			init = { headers: { "X-Auth-Token": key } };
			break;
		}
		case "twilio": {
			const sid = required("TWILIO_ACCOUNT_SID");
			const token = required("TWILIO_AUTH_TOKEN");
			if (!sid || !token) return { ok: false, reason: "Twilio is not configured." };
			url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls/${encodeURIComponent(id)}.json`;
			init = { headers: { Authorization: basicAuth(sid, token) } };
			break;
		}
		case "plivo": {
			const authId = required("PLIVO_AUTH_ID");
			const token = required("PLIVO_AUTH_TOKEN");
			if (!authId || !token) return { ok: false, reason: "Plivo is not configured." };
			url = `https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/${encodeURIComponent(id)}/`;
			init = { headers: { Authorization: basicAuth(authId, token) } };
			break;
		}
		case "vapi": {
			const key = required("VAPI_API_KEY");
			if (!key) return { ok: false, reason: "Vapi is not configured." };
			url = `https://api.vapi.ai/call/${encodeURIComponent(id)}`;
			init = { headers: { Authorization: `Bearer ${key}` } };
			break;
		}
	}

	let response: Response;
	try {
		response = await fetch(url, init);
	} catch {
		return { ok: false, reason: "The provider could not be reached." };
	}
	if (!response.ok) {
		return { ok: false, reason: await readErrorText(response) };
	}
	let body: Record<string, unknown>;
	try {
		body = (await response.json()) as Record<string, unknown>;
	} catch {
		return { ok: false, reason: "The provider returned an invalid status response." };
	}
	const state = providerState(body);
	return { ok: true, code: callCode(state, null) };
}

export async function hangupCall(
	meta: unknown,
	providerCallId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
	const provider = providerFromMeta(meta);
	if (!provider) {
		return {
			ok: false,
			reason: "Call has no valid provider metadata; refusing to guess how to hang it up.",
		};
	}
	if (!providerCallId) {
		return { ok: false, reason: "Call has no provider call identifier." };
	}
	return dialerFor(provider).hangup(providerCallId);
}
