import { describe, expect, it } from "bun:test";
import {
	buildRequest,
	buildSdp,
	computeDigest,
	getHeader,
	getHeaders,
	parseAuthChallenge,
	parseSdpAnswer,
	parseSipMessage,
} from "../agent/lib/telephony/sip-protocol";

const RFC2617 = {
	username: "Mufasa",
	password: "Circle Of Life",
	realm: "testrealm@host.com",
	nonce: "dcd98b7102dd2f0e8b11d0f600bfb0c093",
	uri: "/dir/index.html",
	method: "GET",
	nc: "00000001",
	cnonce: "0a4f113b",
} as const;

const UNAUTHORIZED = [
	"SIP/2.0 401 Unauthorized",
	"Via: SIP/2.0/UDP 203.0.113.7:5060;branch=z9hG4bK74bf9;received=203.0.113.7",
	"From: <sip:1001@sip.nonoh.net>;tag=9fxced76sl",
	"To: <sip:1001@sip.nonoh.net>;tag=as5e0b6e0d",
	"Call-ID: 5f2a1c9d4b3e8a7f",
	"CSeq: 1 REGISTER",
	'WWW-Authenticate: Digest realm="sip.nonoh.net", nonce="4f7a2b9c1d8e5f30", qop="auth", algorithm=MD5',
	"Content-Length: 0",
	"",
	"",
].join("\r\n");

describe("computeDigest", () => {
	it("reproduces the RFC 2617 worked example with qop=auth", () => {
		const response = computeDigest(
			{
				realm: RFC2617.realm,
				nonce: RFC2617.nonce,
				qop: "auth",
				algorithm: "MD5",
			},
			{
				username: RFC2617.username,
				password: RFC2617.password,
				method: RFC2617.method,
				uri: RFC2617.uri,
				nc: RFC2617.nc,
				cnonce: RFC2617.cnonce,
			},
		);

		expect(response).toBe("6629fae49393a05397450978507c4ef1");
	});

	it("reproduces the RFC 2617 example without qop", () => {
		const response = computeDigest(
			{ realm: RFC2617.realm, nonce: RFC2617.nonce },
			{
				username: RFC2617.username,
				password: RFC2617.password,
				method: RFC2617.method,
				uri: RFC2617.uri,
			},
		);

		expect(response).toBe("670fd8c2df070c60b045671b8b24ff02");
	});

	it("uses SHA-256 for the same formula when the challenge asks for it", () => {
		const withQop = computeDigest(
			{
				realm: RFC2617.realm,
				nonce: RFC2617.nonce,
				qop: "auth",
				algorithm: "SHA-256",
			},
			{
				username: RFC2617.username,
				password: RFC2617.password,
				method: RFC2617.method,
				uri: RFC2617.uri,
				nc: RFC2617.nc,
				cnonce: RFC2617.cnonce,
			},
		);
		const withoutQop = computeDigest(
			{ realm: RFC2617.realm, nonce: RFC2617.nonce, algorithm: "sha256" },
			{
				username: RFC2617.username,
				password: RFC2617.password,
				method: RFC2617.method,
				uri: RFC2617.uri,
			},
		);

		expect(withQop).toBe(
			"5abdd07184ba512a22c53f41470e5eea7dcaa3a93a59b630c13dfe0a5dc6e38b",
		);
		expect(withoutQop).toBe(
			"e71f89d8267982ee1cd4dfb3637698eaf2f55848fe056aee7be175262aab5d2a",
		);
	});

	it("changes the response when the uri, nonce or cnonce changes", () => {
		const base = {
			username: RFC2617.username,
			password: RFC2617.password,
			method: RFC2617.method,
			uri: RFC2617.uri,
			nc: RFC2617.nc,
			cnonce: RFC2617.cnonce,
		};
		const challenge = {
			realm: RFC2617.realm,
			nonce: RFC2617.nonce,
			qop: "auth",
		};

		expect(computeDigest(challenge, base)).not.toBe(
			computeDigest(challenge, { ...base, uri: "sip:sip.nonoh.net" }),
		);
		expect(computeDigest(challenge, base)).not.toBe(
			computeDigest(challenge, { ...base, cnonce: "deadbeef" }),
		);
		expect(computeDigest(challenge, base)).not.toBe(
			computeDigest({ ...challenge, nonce: "0" }, base),
		);
	});
});

describe("parseSipMessage", () => {
	it("reads a 401 response and its digest challenge", () => {
		const message = parseSipMessage(UNAUTHORIZED);

		expect(message.isResponse).toBe(true);
		expect(message.status).toBe(401);
		expect(message.method).toBe("");
		expect(message.body).toBe("");

		const challenge = parseAuthChallenge(
			getHeader(message, "WWW-Authenticate") ?? "",
		);

		expect(challenge.realm).toBe("sip.nonoh.net");
		expect(challenge.nonce).toBe("4f7a2b9c1d8e5f30");
		expect(challenge.qop).toBe("auth");
		expect(challenge.algorithm).toBe("MD5");
	});

	it("keeps duplicate Via headers, in order", () => {
		const raw = [
			"INVITE sip:+15551234567@sip.nonoh.net SIP/2.0",
			"Via: SIP/2.0/UDP 203.0.113.7:5060;branch=z9hG4bKaaaa",
			"Via: SIP/2.0/UDP 198.51.100.4:5060;branch=z9hG4bKbbbb",
			"Call-ID: 5f2a1c9d4b3e8a7f",
			"CSeq: 1 INVITE",
			"Content-Length: 0",
			"",
			"",
		].join("\r\n");

		const message = parseSipMessage(raw);

		expect(message.isResponse).toBe(false);
		expect(message.method).toBe("INVITE");
		expect(getHeaders(message, "via")).toEqual([
			"SIP/2.0/UDP 203.0.113.7:5060;branch=z9hG4bKaaaa",
			"SIP/2.0/UDP 198.51.100.4:5060;branch=z9hG4bKbbbb",
		]);
		expect(getHeader(message, "VIA")).toBe(
			"SIP/2.0/UDP 203.0.113.7:5060;branch=z9hG4bKaaaa",
		);
	});

	it("returns an empty body when there is no blank line", () => {
		const message = parseSipMessage("SIP/2.0 200 OK\r\nCSeq: 1 INVITE\r\n");

		expect(message.isResponse).toBe(true);
		expect(message.status).toBe(200);
		expect(message.body).toBe("");
		expect(getHeader(message, "CSeq")).toBe("1 INVITE");
	});

	it("splits headers and body at the first blank line", () => {
		const sdp = buildSdp({
			username: "agent",
			sessId: "1",
			sessVersion: "2",
			ip: "203.0.113.9",
			port: 40000,
		});
		const raw = [
			"SIP/2.0 200 OK",
			"Content-Type: application/sdp",
			`Content-Length: ${Buffer.byteLength(sdp)}`,
			"",
			sdp,
		].join("\r\n");

		const message = parseSipMessage(raw);

		expect(message.status).toBe(200);
		expect(getHeader(message, "content-type")).toBe("application/sdp");
		expect(message.body).toBe(sdp);
	});
});

describe("parseAuthChallenge", () => {
	it("reads opaque and stale alongside the required fields", () => {
		const challenge = parseAuthChallenge(
			'Digest realm="sip.nonoh.net", nonce="abc123", opaque="5ccc069c", stale=FALSE, qop="auth,auth-int"',
		);

		expect(challenge.realm).toBe("sip.nonoh.net");
		expect(challenge.nonce).toBe("abc123");
		expect(challenge.opaque).toBe("5ccc069c");
		expect(challenge.stale).toBe(false);
		expect(challenge.qop).toBe("auth,auth-int");
	});

	it("accepts a full header value including the scheme", () => {
		const challenge = parseAuthChallenge(
			'WWW-Authenticate: Digest realm="sip.nonoh.net", nonce="abc123"',
		);

		expect(challenge.realm).toBe("sip.nonoh.net");
		expect(challenge.nonce).toBe("abc123");
	});
});

describe("buildSdp and parseSdpAnswer", () => {
	const sdp = buildSdp({
		username: "agent",
		sessId: "2890844526",
		sessVersion: "2890844527",
		ip: "203.0.113.9",
		port: 40000,
	});

	it("round-trips ip, port and payload type", () => {
		expect(parseSdpAnswer(sdp)).toEqual({
			ip: "203.0.113.9",
			port: 40000,
			payloadType: 0,
		});
	});

	it("writes a well-formed session description", () => {
		const lines = sdp.split("\r\n");

		expect(lines[0]).toBe("v=0");
		expect(lines[1]?.split(/\s+/)).toHaveLength(6);
		expect(lines[2]).toBe("s=-");
		expect(lines[3]).toBe("c=IN IP4 203.0.113.9");
		expect(lines[4]).toBe("t=0 0");
		expect(sdp).toContain("t=0 0");
		expect(sdp).toContain("m=audio 40000 RTP/AVP 0 101");
		expect(sdp).toContain("a=rtpmap:0 PCMU/8000");
		expect(sdp).toContain("a=rtpmap:101 telephone-event/8000");
		expect(sdp).not.toContain("0.0.0.0");
		expect(lines[3]).toBe("c=IN IP4 203.0.113.9");
	});

	it("prefers the media-level connection address", () => {
		const answer = [
			"v=0",
			"o=- 1 1 IN IP4 198.51.100.4",
			"s=-",
			"c=IN IP4 198.51.100.4",
			"t=0 0",
			"m=audio 18732 RTP/AVP 8",
			"c=IN IP4 198.51.100.9",
			"a=rtpmap:8 PCMA/8000",
		].join("\r\n");

		expect(parseSdpAnswer(answer)).toEqual({
			ip: "198.51.100.9",
			port: 18732,
			payloadType: 8,
		});
	});

	it("falls back to the session address when no media is offered", () => {
		const answer = [
			"v=0",
			"o=- 1 1 IN IP4 198.51.100.4",
			"s=-",
			"c=IN IP4 198.51.100.4",
			"t=0 0",
		].join("\r\n");

		expect(parseSdpAnswer(answer)).toEqual({
			ip: "198.51.100.4",
			port: 0,
			payloadType: 0,
		});
	});
});

describe("buildRequest", () => {
	const body = "v=0\r\no=- 1 1 IN IP4 203.0.113.9";

	const request = buildRequest({
		method: "INVITE",
		requestUri: "sip:+15551234567@sip.nonoh.net",
		headers: {
			Via: "SIP/2.0/UDP 203.0.113.9:5060;branch=z9hG4bK74bf9",
			"Call-ID": "5f2a1c9d4b3e8a7f",
			CSeq: "1 INVITE",
		},
		body,
	});

	it("writes the start line and terminates every line with CRLF", () => {
		expect(
			request.startsWith("INVITE sip:+15551234567@sip.nonoh.net SIP/2.0\r\n"),
		).toBe(true);
		expect(request).toContain("\r\nCall-ID: 5f2a1c9d4b3e8a7f\r\n");
		expect(request).not.toMatch(/[^\r]\n/);
		expect(request.endsWith(body)).toBe(true);
	});

	it("sizes Content-Length in bytes", () => {
		expect(request).toContain(
			`\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
		);

		const parsed = parseSipMessage(request);
		expect(parsed.method).toBe("INVITE");
		expect(parsed.isResponse).toBe(false);
		expect(getHeader(parsed, "Content-Length")).toBe(
			String(Buffer.byteLength(body)),
		);
		expect(parsed.body).toBe(body);
	});

	it("counts bytes rather than characters", () => {
		const multibyte = "ääå × 3";
		const built = buildRequest({
			method: "REGISTER",
			requestUri: "sip:sip.nonoh.net",
			headers: {},
			body: multibyte,
		});

		expect(Buffer.byteLength(multibyte)).not.toBe(multibyte.length);
		expect(getHeader(parseSipMessage(built), "content-length")).toBe(
			String(Buffer.byteLength(multibyte)),
		);
	});

	it("sends Content-Length: 0 when there is no body", () => {
		const built = buildRequest({
			method: "BYE",
			requestUri: "sip:sip.nonoh.net",
			headers: { "Call-ID": "5f2a1c9d4b3e8a7f" },
		});

		expect(built).toContain("\r\nContent-Length: 0\r\n\r\n");
	});
});
