import { createHash } from "node:crypto";

export interface SipMessage {
	isResponse: boolean;
	status: number;
	method: string;
	headers: Map<string, string[]>;
	body: string;
}

export interface DigestChallenge {
	realm: string;
	nonce: string;
	qop?: string;
	opaque?: string;
	algorithm?: string;
	stale?: boolean;
}

export interface SdpEndpoint {
	ip: string;
	port: number;
	payloadType: number;
}

const START_LINE_RESPONSE = /^SIP\/\d+\.\d+\s+(\d{3})/;
const START_LINE_REQUEST = /^([A-Za-z]+)\s+\S+\s+SIP\/\d+\.\d+/;
const AUTH_PARAM = /([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g;

export function getHeader(
	message: SipMessage,
	name: string,
): string | undefined {
	return message.headers.get(name.toLowerCase())?.[0];
}

export function getHeaders(message: SipMessage, name: string): string[] {
	return message.headers.get(name.toLowerCase()) ?? [];
}

function findHeaderSeparator(
	raw: string,
): { index: number; length: number } | null {
	const crlf = raw.indexOf("\r\n\r\n");
	const lf = raw.indexOf("\n\n");
	if (crlf === -1) return lf === -1 ? null : { index: lf, length: 2 };
	if (lf === -1) return { index: crlf, length: 4 };
	return crlf < lf ? { index: crlf, length: 4 } : { index: lf, length: 2 };
}

export function parseSipMessage(raw: string): SipMessage {
	const separator = findHeaderSeparator(raw);
	const head = separator === null ? raw : raw.slice(0, separator.index);
	const lines = head.replace(/\r\n/g, "\n").split("\n");
	const startLine = (lines[0] ?? "").trim();

	const statusMatch = START_LINE_RESPONSE.exec(startLine);
	const methodMatch = START_LINE_REQUEST.exec(startLine);
	const isResponse = statusMatch !== null;

	const headers = parseHeaderLines(lines.slice(1));
	const body =
		separator === null ? "" : raw.slice(separator.index + separator.length);

	return {
		isResponse,
		status: statusMatch ? Number.parseInt(statusMatch[1] ?? "0", 10) : 0,
		method: isResponse ? "" : (methodMatch?.[1] ?? ""),
		headers,
		body,
	};
}

function parseHeaderLines(headerLines: string[]): Map<string, string[]> {
	const headers = new Map<string, string[]>();
	let lastKey: string | null = null;

	for (const line of headerLines) {
		if (line.startsWith(" ") || line.startsWith("\t")) {
			const values = lastKey === null ? undefined : headers.get(lastKey);
			const last = values?.[values.length - 1];
			if (values && last !== undefined) {
				values[values.length - 1] = `${last} ${line.trim()}`;
			}
			continue;
		}

		const index = line.indexOf(":");
		if (index <= 0) continue;

		const key = line.slice(0, index).trim().toLowerCase();
		const value = line.slice(index + 1).trim();
		const existing = headers.get(key);
		if (existing) existing.push(value);
		else headers.set(key, [value]);
		lastKey = key;
	}

	return headers;
}

export function buildRequest(parts: {
	method: string;
	requestUri: string;
	headers: Record<string, string>;
	body?: string;
}): string {
	const body = parts.body ?? "";
	const lines = [`${parts.method} ${parts.requestUri} SIP/2.0`];

	let hasContentLength = false;
	for (const [name, value] of Object.entries(parts.headers)) {
		if (name.toLowerCase() === "content-length") hasContentLength = true;
		lines.push(`${name}: ${value}`);
	}
	if (!hasContentLength) {
		lines.push(`Content-Length: ${Buffer.byteLength(body, "utf8")}`);
	}

	lines.push("", "");
	return `${lines.join("\r\n")}${body}`;
}

export function parseAuthChallenge(header: string): DigestChallenge {
	const params = new Map<string, string>();
	const withoutScheme = header.trim().replace(/^digest\s+/i, "");

	for (const match of withoutScheme.matchAll(AUTH_PARAM)) {
		const key = (match[1] ?? "").toLowerCase();
		const value = match[2] ?? match[3] ?? "";
		params.set(key, value);
	}

	const challenge: DigestChallenge = {
		realm: params.get("realm") ?? "",
		nonce: params.get("nonce") ?? "",
	};

	const qop = params.get("qop");
	if (qop !== undefined) challenge.qop = qop;

	const opaque = params.get("opaque");
	if (opaque !== undefined) challenge.opaque = opaque;

	const algorithm = params.get("algorithm");
	if (algorithm !== undefined) challenge.algorithm = algorithm;

	const stale = params.get("stale");
	if (stale !== undefined) challenge.stale = stale.toLowerCase() === "true";

	return challenge;
}

function hashName(algorithm: string | undefined): string {
	const normalized = (algorithm ?? "md5").trim().toLowerCase();
	const base = normalized.endsWith("-sess")
		? normalized.slice(0, -"-sess".length)
		: normalized;
	if (base === "sha256" || base === "sha-256") return "sha256";
	if (base === "sha512" || base === "sha-512") return "sha512";
	return "md5";
}

export function computeDigest(
	challenge: DigestChallenge,
	input: {
		username: string;
		password: string;
		method: string;
		uri: string;
		nc?: string;
		cnonce?: string;
	},
): string {
	const name = hashName(challenge.algorithm);
	const ha1 = createHash(name)
		.update(`${input.username}:${challenge.realm}:${input.password}`)
		.digest("hex");
	const ha2 = createHash(name)
		.update(`${input.method}:${input.uri}`)
		.digest("hex");

	const qopValues = (challenge.qop ?? "")
		.split(",")
		.map((value) => value.trim().toLowerCase());

	if (qopValues.includes("auth") && input.nc && input.cnonce) {
		return createHash(name)
			.update(
				`${ha1}:${challenge.nonce}:${input.nc}:${input.cnonce}:auth:${ha2}`,
			)
			.digest("hex");
	}

	return createHash(name)
		.update(`${ha1}:${challenge.nonce}:${ha2}`)
		.digest("hex");
}

export function buildSdp(options: {
	username: string;
	sessId: string;
	sessVersion: string;
	ip: string;
	port: number;
}): string {
	return [
		"v=0",
		`o=${options.username} ${options.sessId} ${options.sessVersion} IN IP4 ${options.ip}`,
		"s=-",
		`c=IN IP4 ${options.ip}`,
		"t=0 0",
		`m=audio ${options.port} RTP/AVP 0 101`,
		"a=rtpmap:0 PCMU/8000",
		"a=rtpmap:101 telephone-event/8000",
		"a=fmtp:101 0-16",
		"a=ptime:20",
		"a=sendrecv",
	].join("\r\n");
}

export function parseSdpAnswer(body: string): SdpEndpoint {
	const lines = body.replace(/\r\n/g, "\n").split("\n");

	let sessionIp = "";
	let mediaIp: string | null = null;
	let inAudio = false;
	let port = 0;
	let payloadType = 0;

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (line.startsWith("m=")) {
			const fields = line.slice(2).split(/\s+/);
			if (fields[0] !== "audio" || inAudio) continue;
			inAudio = true;
			port = parseNumber(fields[1], 0);
			payloadType = parseNumber(fields[3], 0);
			continue;
		}

		if (line.startsWith("c=")) {
			const fields = line.slice(2).split(/\s+/);
			const address = (fields[2] ?? "").split("/")[0] ?? "";
			if (inAudio) mediaIp ??= address;
			else sessionIp = address;
		}
	}

	return { ip: mediaIp ?? sessionIp, port, payloadType };
}

function parseNumber(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}
