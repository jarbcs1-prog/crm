import { randomBytes } from "node:crypto";
import {
	buildRequest,
	buildSdp,
	computeDigest,
	type DigestChallenge,
	getHeader,
	getHeaders,
	parseAuthChallenge,
	parseSdpAnswer,
	type SipMessage,
} from "./sip-protocol";
import {
	newBranch,
	readSipServerConfig,
	SipTransport,
	type TransportAddress,
} from "./sip-transport";

const REGISTER_TIMEOUT_MS = 10_000;
const INVITE_TIMEOUT_MS = 60_000;
const BYE_TIMEOUT_MS = 10_000;
const CANCEL_TIMEOUT_MS = 5_000;
const REGISTER_EXPIRES_SECONDS = 3600;
const KEEPALIVE_INTERVAL_MS = 120_000;

export interface MediaOffer {
	ip: string;
	port: number;
}

export interface RegisterResult {
	ok: boolean;
	status?: number;
	reason?: string;
	publicAddress?: { ip: string; port: number };
}

export interface InviteResult {
	ok: boolean;
	status?: number;
	reason?: string;
	sipCallId?: string;
	remoteMedia?: { ip: string; port: number; payloadType: number };
	dialog?: SipDialog;
}

export interface SipDialog {
	callId: string;
	localTag: string;
	remoteTag: string;
	remoteTarget: string;
	route: string[];
}

export interface RegisterOptions {
	onResponse?: (status: number) => void;
	timeoutMs?: number;
}

export interface InviteOptions {
	onProvisional?: (status: number) => void;
	timeoutMs?: number;
}

interface Credentials {
	server: string;
	port: number;
	username: string;
	password: string;
	displayName: string;
}

interface DialogState {
	branch: string;
	cseq: number;
	requestUri: string;
	toUri: string;
	localTag: string;
	remoteTag: string;
	route: string[];
}

function readCredentials(): Credentials | null {
	const config = readSipServerConfig();
	const username = process.env.NONOH_USERNAME?.trim() ?? "";
	const password = process.env.NONOH_PASSWORD?.trim() ?? "";
	const displayName = process.env.NONOH_DISPLAY_NAME?.trim() ?? "";

	if (config.server.length === 0 || username.length === 0) return null;
	if (password.length === 0) return null;

	return {
		server: config.server,
		port: config.port,
		username,
		password,
		displayName,
	};
}

function newTag(): string {
	return randomBytes(6).toString("hex");
}

function registerUri(creds: Credentials): string {
	return creds.port === 5060
		? `sip:${creds.server}`
		: `sip:${creds.server}:${creds.port}`;
}

function targetUri(to: string, creds: Credentials): string {
	const trimmed = to.trim();
	if (trimmed.startsWith("sip:") || trimmed.startsWith("sips:")) return trimmed;
	if (trimmed.includes("@")) return `sip:${trimmed}`;
	return `sip:${trimmed}@${creds.server}`;
}

function tagOf(value: string | undefined): string {
	if (!value) return "";
	const match = /;tag=([^;]+)/.exec(value);
	return match?.[1] ?? "";
}

function authorizationValue(
	challenge: DigestChallenge,
	parts: {
		username: string;
		uri: string;
		response: string;
		nc: string;
		cnonce: string;
	},
): string {
	const params = [
		`username="${parts.username}"`,
		`realm="${challenge.realm}"`,
		`nonce="${challenge.nonce}"`,
		`uri="${parts.uri}"`,
		`response="${parts.response}"`,
	];

	if (challenge.algorithm) {
		params.push(`algorithm=${challenge.algorithm.toUpperCase()}`);
	}
	if (challenge.qop?.toLowerCase().includes("auth")) {
		params.push("qop=auth");
		params.push(`nc=${parts.nc}`);
		params.push(`cnonce="${parts.cnonce}"`);
	}
	if (challenge.opaque) {
		params.push(`opaque="${challenge.opaque}"`);
	}

	return `Digest ${params.join(", ")}`;
}

function routeHeaders(route: string[]): Record<string, string> {
	return route.length === 0 ? {} : { Route: [...route].reverse().join(", ") };
}

function registerFailureReason(status: number): string {
	if (status === 401 || status === 407) {
		return "SIP authentication failed (check NONOH_USERNAME and NONOH_PASSWORD).";
	}
	if (status === 403) return "Registration forbidden (403) - account rejected.";
	if (status === 404) return "Registration rejected: account not found (404).";
	if (status === 423) return "Registration interval too brief (423).";
	return `Registration failed with SIP ${status}.`;
}

function inviteFailureReason(status: number): string {
	switch (status) {
		case 401:
		case 407:
			return "Call rejected: SIP authentication failed.";
		case 402:
			return "Call rejected: payment required (402) - check the Nonoh balance.";
		case 403:
			return "Call rejected: forbidden (403).";
		case 404:
			return "Call failed: number not found (404).";
		case 480:
			return "Call not answered: temporarily unavailable (480).";
		case 486:
			return "Call failed: line busy (486).";
		case 487:
			return "Call cancelled (487).";
		case 488:
			return "Call failed: no acceptable media offer (488).";
		case 502:
			return "Call failed: bad gateway (502).";
		case 603:
			return "Call declined (603).";
		default:
			return `Call failed with SIP ${status}.`;
	}
}

export class SipClient {
	private readonly transport: SipTransport;
	private readonly registerCallId: string;
	private readonly registerTag = newTag();
	private readonly dialogs = new Map<string, DialogState>();
	private readonly cseqs = new Map<string, number>();
	private readonly acked = new Set<string>();
	private keepalive: ReturnType<typeof setInterval> | undefined;
	private registered = false;
	private closed = false;

	private constructor(transport: SipTransport) {
		this.transport = transport;
		this.registerCallId = `${newTag()}@${transport.publicAddress.ip}`;
	}

	static async create(): Promise<SipClient> {
		return new SipClient(await SipTransport.open());
	}

	get publicAddress(): TransportAddress {
		return this.transport.publicAddress;
	}

	get publicAddressSource(): "stun" | "local" {
		return this.transport.source;
	}

	get server(): string {
		return this.transport.server;
	}

	get serverPort(): number {
		return this.transport.serverPort;
	}

	get isRegistered(): boolean {
		return this.registered;
	}

	async register(options: RegisterOptions = {}): Promise<RegisterResult> {
		const creds = readCredentials();
		const publicAddress = this.publicAddress;

		if (!creds) {
			this.registered = false;
			return {
				ok: false,
				reason:
					"Nonoh SIP is not configured (NONOH_SIP_SERVER, NONOH_USERNAME and NONOH_PASSWORD are required).",
			};
		}
		if (this.closed) {
			return { ok: false, reason: "SIP client is closed.", publicAddress };
		}

		const requestUri = registerUri(creds);
		const { response } = await this.transact({
			creds,
			method: "REGISTER",
			requestUri,
			callId: this.registerCallId,
			extraHeaders: {
				From: this.fromHeader(creds, this.registerTag),
				To: `<sip:${creds.username}@${creds.server}>`,
				Contact: this.contactHeader(creds),
				Expires: String(REGISTER_EXPIRES_SECONDS),
			},
			timeoutMs: options.timeoutMs ?? REGISTER_TIMEOUT_MS,
			onResponse: options.onResponse,
		});

		if (!response) {
			this.registered = false;
			return {
				ok: false,
				reason: "No response from the SIP server (timeout).",
				publicAddress,
			};
		}

		if (response.status === 200) {
			this.registered = true;
			this.startKeepalive();
			return { ok: true, status: 200, publicAddress };
		}

		this.registered = false;
		return {
			ok: false,
			status: response.status,
			reason: registerFailureReason(response.status),
			publicAddress,
		};
	}

	async invite(
		toNumber: string,
		media: MediaOffer,
		options: InviteOptions = {},
	): Promise<InviteResult> {
		const creds = readCredentials();

		if (!creds) {
			return {
				ok: false,
				reason:
					"Nonoh SIP is not configured (NONOH_SIP_SERVER, NONOH_USERNAME and NONOH_PASSWORD are required).",
			};
		}
		if (this.closed) return { ok: false, reason: "SIP client is closed." };
		if (!this.registered) await this.register();

		const requestUri = targetUri(toNumber, creds);
		const callId = `${newTag()}@${this.publicAddress.ip}`;
		const localTag = newTag();
		const session = String(Date.now());
		const body = buildSdp({
			username: creds.username,
			sessId: session,
			sessVersion: session,
			ip: media.ip,
			port: media.port,
		});

		let ringing = false;
		const { response, branch, cseq } = await this.transact({
			creds,
			method: "INVITE",
			requestUri,
			callId,
			extraHeaders: {
				From: this.fromHeader(creds, localTag),
				To: `<${requestUri}>`,
				Contact: this.contactHeader(creds),
				"Content-Type": "application/sdp",
			},
			body,
			timeoutMs: options.timeoutMs ?? INVITE_TIMEOUT_MS,
			onProvisional: (message) => {
				if (message.status === 180) ringing = true;
				options.onProvisional?.(message.status);
			},
		});

		if (!response) {
			return {
				ok: false,
				sipCallId: callId,
				reason: ringing
					? "The call rang but was never answered (timeout)."
					: "No response from the SIP server (timeout).",
			};
		}

		const remoteTag = tagOf(getHeader(response, "to"));
		const route = getHeaders(response, "record-route");
		const state: DialogState = {
			branch,
			cseq,
			requestUri,
			toUri: `<${requestUri}>`,
			localTag,
			remoteTag,
			route,
		};

		if (response.status === 200) {
			this.dialogs.set(callId, state);
			const dialog: SipDialog = {
				callId,
				localTag,
				remoteTag,
				remoteTarget: requestUri,
				route,
			};
			await this.ack(dialog);

			const answer = parseSdpAnswer(response.body);
			const remoteMedia =
				answer.port > 0 && answer.ip.length > 0 ? answer : undefined;

			return {
				ok: true,
				status: 200,
				sipCallId: callId,
				remoteMedia,
				dialog,
			};
		}

		this.transport.send(
			this.compose({
				method: "ACK",
				requestUri,
				callId,
				cseq,
				branch,
				headers: {
					From: this.fromHeader(creds, localTag),
					To:
						remoteTag.length > 0
							? `${state.toUri};tag=${remoteTag}`
							: state.toUri,
					...routeHeaders(route),
				},
			}),
		);

		return {
			ok: false,
			status: response.status,
			reason: inviteFailureReason(response.status),
			sipCallId: callId,
		};
	}

	async ack(dialog: SipDialog): Promise<void> {
		const creds = readCredentials();
		if (!creds || this.closed) return;

		const key = `${dialog.callId}|${dialog.remoteTag}`;
		if (this.acked.has(key)) return;
		this.acked.add(key);

		const state = this.dialogs.get(dialog.callId);
		const requestUri = state?.requestUri ?? dialog.remoteTarget;
		const toUri = state?.toUri ?? dialog.remoteTarget;
		const branch = newBranch();

		this.transport.send(
			this.compose({
				method: "ACK",
				requestUri,
				callId: dialog.callId,
				cseq: this.nextCSeq(dialog.callId),
				branch,
				headers: {
					From: this.fromHeader(creds, state?.localTag ?? dialog.localTag),
					To:
						dialog.remoteTag.length > 0
							? `${toUri};tag=${dialog.remoteTag}`
							: toUri,
					...routeHeaders(dialog.route),
				},
			}),
		);
	}

	async bye(dialog: SipDialog): Promise<void> {
		const creds = readCredentials();
		if (!creds || this.closed) return;

		const state = this.dialogs.get(dialog.callId);
		const requestUri = state?.requestUri ?? dialog.remoteTarget;
		const toUri = state?.toUri ?? dialog.remoteTarget;
		const branch = newBranch();

		const message = this.compose({
			method: "BYE",
			requestUri,
			callId: dialog.callId,
			cseq: this.nextCSeq(dialog.callId),
			branch,
			headers: {
				From: this.fromHeader(creds, state?.localTag ?? dialog.localTag),
				To:
					dialog.remoteTag.length > 0
						? `${toUri};tag=${dialog.remoteTag}`
						: toUri,
				...routeHeaders(dialog.route),
			},
		});

		await this.transport.request(
			message,
			{ branch, method: "BYE" },
			BYE_TIMEOUT_MS,
		);

		this.dialogs.delete(dialog.callId);
		this.cseqs.delete(dialog.callId);
		this.acked.delete(`${dialog.callId}|${dialog.remoteTag}`);
	}

	async cancel(dialog: SipDialog): Promise<void> {
		const creds = readCredentials();
		const state = this.dialogs.get(dialog.callId);
		if (!creds || this.closed || !state) return;

		const message = this.compose({
			method: "CANCEL",
			requestUri: state.requestUri,
			callId: dialog.callId,
			cseq: state.cseq,
			branch: state.branch,
			headers: {
				From: this.fromHeader(creds, state.localTag),
				To: state.toUri,
				...routeHeaders(state.route),
			},
		});

		await this.transport.request(
			message,
			{ branch: state.branch, method: "CANCEL" },
			CANCEL_TIMEOUT_MS,
		);
	}

	stopKeepalive(): void {
		if (!this.keepalive) return;
		clearInterval(this.keepalive);
		this.keepalive = undefined;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.stopKeepalive();
		this.registered = false;
		this.dialogs.clear();
		this.cseqs.clear();
		this.acked.clear();
		this.transport.close();
	}

	private startKeepalive(): void {
		if (this.keepalive || this.closed) return;
		this.keepalive = setInterval(() => {
			void this.register();
		}, KEEPALIVE_INTERVAL_MS);
		this.keepalive.unref?.();
	}

	private nextCSeq(callId: string): number {
		const next = (this.cseqs.get(callId) ?? 0) + 1;
		this.cseqs.set(callId, next);
		return next;
	}

	private fromHeader(creds: Credentials, tag: string): string {
		const uri = `<sip:${creds.username}@${creds.server}>`;
		return creds.displayName.length > 0
			? `"${creds.displayName}" ${uri};tag=${tag}`
			: `${uri};tag=${tag}`;
	}

	private contactHeader(creds: Credentials): string {
		const { ip, port } = this.publicAddress;
		return `<sip:${creds.username}@${ip}:${port}>`;
	}

	private compose(parts: {
		method: string;
		requestUri: string;
		callId: string;
		cseq: number;
		branch: string;
		headers: Record<string, string>;
		body?: string;
	}): string {
		const { ip, port } = this.publicAddress;
		return buildRequest({
			method: parts.method,
			requestUri: parts.requestUri,
			headers: {
				Via: `SIP/2.0/UDP ${ip}:${port};branch=${parts.branch};rport`,
				"Max-Forwards": "70",
				"Call-ID": parts.callId,
				CSeq: `${parts.cseq} ${parts.method}`,
				...parts.headers,
			},
			body: parts.body,
		});
	}

	private async transact(parts: {
		creds: Credentials;
		method: string;
		requestUri: string;
		callId: string;
		extraHeaders: Record<string, string>;
		body?: string;
		timeoutMs: number;
		onProvisional?: (message: SipMessage) => void;
		onResponse?: (status: number) => void;
	}): Promise<{ response: SipMessage | null; branch: string; cseq: number }> {
		let branch = newBranch();
		let cseq = this.nextCSeq(parts.callId);

		let response = await this.transport.request(
			this.compose({
				method: parts.method,
				requestUri: parts.requestUri,
				callId: parts.callId,
				cseq,
				branch,
				headers: parts.extraHeaders,
				body: parts.body,
			}),
			{ branch, method: parts.method },
			parts.timeoutMs,
			parts.onProvisional,
		);
		parts.onResponse?.(response?.status ?? 0);

		if (!response || (response.status !== 401 && response.status !== 407)) {
			return { response, branch, cseq };
		}

		const headerName =
			response.status === 401 ? "WWW-Authenticate" : "Proxy-Authenticate";
		const authHeaderName =
			response.status === 401 ? "Authorization" : "Proxy-Authorization";
		const challengeHeader = getHeader(response, headerName);
		if (!challengeHeader) return { response, branch, cseq };

		const challenge = parseAuthChallenge(challengeHeader);
		const cnonce = randomBytes(8).toString("hex");
		const nc = "00000001";
		const digest = computeDigest(challenge, {
			username: parts.creds.username,
			password: parts.creds.password,
			method: parts.method,
			uri: parts.requestUri,
			nc,
			cnonce,
		});

		branch = newBranch();
		cseq = this.nextCSeq(parts.callId);
		response = await this.transport.request(
			this.compose({
				method: parts.method,
				requestUri: parts.requestUri,
				callId: parts.callId,
				cseq,
				branch,
				headers: {
					...parts.extraHeaders,
					[authHeaderName]: authorizationValue(challenge, {
						username: parts.creds.username,
						uri: parts.requestUri,
						response: digest,
						nc,
						cnonce,
					}),
				},
				body: parts.body,
			}),
			{ branch, method: parts.method },
			parts.timeoutMs,
			parts.onProvisional,
		);
		parts.onResponse?.(response?.status ?? 0);

		return { response, branch, cseq };
	}
}
