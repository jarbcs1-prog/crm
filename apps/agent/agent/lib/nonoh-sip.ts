import { randomUUID } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";

interface NonohConfig {
	server: string;
	port: number;
	tls: boolean;
	username: string;
	password: string;
	displayName: string;
}

const CONFIG: NonohConfig = {
	server: process.env.NONOH_SIP_SERVER?.trim() ?? "sip.nonoh.net",
	port: Number.parseInt(process.env.NONOH_SIP_PORT ?? "5060", 10),
	tls: (process.env.NONOH_SIP_TLS ?? "false") === "true",
	username: process.env.NONOH_USERNAME?.trim() ?? "jarbcs",
	password: process.env.NONOH_PASSWORD?.trim() ?? "NO2026noh!",
	displayName: process.env.NONOH_DISPLAY_NAME?.trim() ?? "+46701946961",
};

const NONOH_TIMEOUT_MS = 15_000;

function nonce(): string {
	return randomUUID().replace(/-/g, "").slice(0, 8);
}

function parseSipMessage(raw: string): { status: number; first: string; headers: Record<string, string>; body: string } {
	const lines = raw.split(/\r?\n/);
	const first = lines[0] ?? "";
	const headers: Record<string, string> = {};
	for (const line of lines.slice(1)) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
		}
	}
	const match = first.match(/^SIP\/2\.0\s+(\d+)/);
	return { status: match ? Number(match[1]) : 0, first, headers, body: lines.slice(lines.indexOf("") + 1).join("\n") };
}

function buildInvite(toNumber: string, callId: string, localTag: string, remoteTag: string, cseq: number): string {
	const sdp = [
		"v=0",
		`o=${CONFIG.username} ${nonce()} IN IP4 ${CONFIG.server}`,
		"s=Nonoh Call",
		`t=${Date.now()}`,
		`m=audio ${30000 + Math.floor(Math.random() * 5000)} RTP/AVP 0 8 101`,
		"c=IN IP4 0.0.0.0",
		"a=rtpmap:0 PCMU/8000",
		"a=rtpmap:8 PCMA/8000",
		"a=rtpmap:101 telephone-event/8000",
		"a=fmtp:101 0-16",
		"a=ptime:20",
	].join("\r\n");

	return [
		`INVITE sip:${toNumber}@${CONFIG.server} SIP/2.0`,
		`Via: SIP/2.0/UDP ${CONFIG.server}:${CONFIG.port};branch=z9hG4bK${nonce()}`,
		"Max-Forwards: 70",
		`To: <sip:${toNumber}@${CONFIG.server}>`,
		`From: <sip:${CONFIG.username}@${CONFIG.server}>;tag=${localTag}`,
		`Call-ID: ${callId}`,
		`CSeq: ${cseq} INVITE`,
		`Contact: <sip:${CONFIG.username}@${CONFIG.server}:${CONFIG.port}>`,
		"Content-Type: application/sdp",
		`Content-Length: ${Buffer.byteLength(sdp)}`,
		"",
		sdp,
	].join("\r\n");
}

function buildRegister(cseq: number, callId: string): string {
	return [
		`REGISTER sip:${CONFIG.server} SIP/2.0`,
		`Via: SIP/2.0/UDP ${CONFIG.server}:${CONFIG.port};branch=z9hG4bK${nonce()}`,
		"Max-Forwards: 70",
		`To: <sip:${CONFIG.username}@${CONFIG.server}>`,
		`From: <sip:${CONFIG.username}@${CONFIG.server}>;tag=${nonce()}`,
		`Call-ID: ${callId}`,
		`CSeq: ${cseq} REGISTER`,
		`Contact: <sip:${CONFIG.username}@${CONFIG.server}:${CONFIG.port}>`,
		"Expires: 3600",
		`Authorization: Digest username="${CONFIG.username}", realm="${CONFIG.server}", nonce="${nonce()}", uri="sip:${CONFIG.server}", response="${nonce()}"`,
		"Content-Length: 0",
		"",
	].join("\r\n");
}

export interface NonohCallResult {
	ok: boolean;
	callId?: string;
	sipCallId?: string;
	reason?: string;
}

export class NonohSipClient {
	private socket: Socket | null = null;
	private registered = false;
	private registeredAt = 0;
	private pending = new Map<string, { resolve: (v: NonohCallResult) => void; timer: ReturnType<typeof setTimeout> }>();

	get isConfigured(): boolean {
		return CONFIG.username.length > 0 && CONFIG.password.length > 0 && CONFIG.server.length > 0;
	}

	get isRegistered(): boolean {
		if (!this.registered) return false;
		return Date.now() - this.registeredAt < 3_600_000;
	}

	async register(): Promise<boolean> {
		if (!this.isConfigured) return false;
		if (this.isRegistered) return true;

		return new Promise((resolve) => {
			const callId = randomUUID();
			const cseq = Math.floor(Math.random() * 1000) + 1;
			const msg = buildRegister(cseq, callId);
			const timer = setTimeout(() => { this.registered = false; resolve(false); }, NONOH_TIMEOUT_MS);
			this.send(msg, (response) => {
				const parsed = parseSipMessage(response);
				if (parsed.status === 200) {
					this.registered = true;
					this.registeredAt = Date.now();
					clearTimeout(timer);
					resolve(true);
				} else {
					clearTimeout(timer);
					resolve(false);
				}
			});
		});
	}

	async makeCall(toNumber: string): Promise<NonohCallResult> {
		if (!this.isConfigured) return { ok: false, reason: "Nonoh SIP not configured." };
		if (!this.isRegistered) {
			const ok = await this.register();
			if (!ok) return { ok: false, reason: "Nonoh SIP registration failed." };
		}

		const callId = randomUUID();
		const localTag = nonce();
		const cseq = Math.floor(Math.random() * 1000) + 1;

		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(callId);
				resolve({ ok: false, reason: "Call timed out waiting for response." });
			}, NONOH_TIMEOUT_MS);
			this.pending.set(callId, { resolve: (v) => { clearTimeout(timer); resolve(v); }, timer });
			const msg = buildInvite(toNumber, callId, localTag, nonce(), cseq);
			this.send(msg, (response) => {
				const parsed = parseSipMessage(response);
				this.pending.delete(callId);
				if (parsed.status === 200 || parsed.status === 180) {
					resolve({ ok: true, callId, sipCallId: callId });
				} else if (parsed.status === 486 || parsed.status === 480) {
					resolve({ ok: false, reason: "Call rejected or busy." });
				} else if (parsed.status === 404) {
					resolve({ ok: false, reason: "Subscriber not found." });
				} else if (parsed.status >= 400) {
					resolve({ ok: false, reason: `Nonoh SIP responded with ${parsed.status}.` });
				} else {
					resolve({ ok: false, reason: `Unexpected response: ${parsed.first}` });
				}
			});
		});
	}

	async hangup(sipCallId: string): Promise<void> {
		if (!this.isConfigured || !this.isRegistered) return;
		const msg = [
			`BYE sip:${CONFIG.server} SIP/2.0`,
			`Via: SIP/2.0/UDP ${CONFIG.server}:${CONFIG.port};branch=z9hG4bK${nonce()}`,
			`Call-ID: ${sipCallId}`,
			`CSeq: ${Math.floor(Math.random() * 1000) + 1} BYE`,
			"Content-Length: 0",
			"",
		].join("\r\n");
		this.send(msg, () => {});
	}

	private send(msg: string, callback: (response: string) => void): void {
		try {
			const sock = this.getSocket();
			if (!sock) { callback(""); return; }
			const buf = Buffer.from(msg, "utf8");
			sock.send(buf, CONFIG.port, CONFIG.server);
			const handler = (data: Buffer) => {
				const text = data.toString("utf8");
				if (text.includes("SIP/2.0") && text.length > 0) {
					sock.removeListener("message", handler);
					callback(text);
				}
			};
			sock.on("message", handler);
		} catch {
			callback("");
		}
	}

	private getSocket(): Socket | null {
		try {
			this.socket = createSocket({ type: "udp4" });
			this.socket.on("message", () => {});
		} catch {
			return null;
		}
		return this.socket;
	}
}

const client = new NonohSipClient();

export function nonohConfigured(): boolean { return client.isConfigured; }
export async function nonohRegister(): Promise<boolean> { return client.register(); }
export async function nonohMakeCall(toNumber: string): Promise<NonohCallResult> { return client.makeCall(toNumber); }
export async function nonohHangup(sipCallId: string): Promise<void> { return client.hangup(sipCallId); }
export const NONOH_CONFIG = CONFIG;
