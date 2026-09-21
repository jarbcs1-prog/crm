import { afterEach, describe, expect, it } from "bun:test";
import { createSocket, type Socket } from "node:dgram";
import { pcmToUlaw, ulawToPcm } from "../agent/lib/telephony/audio";
import { RtpSession } from "../agent/lib/telephony/rtp";

const FRAME_SAMPLES = 160;
const FRAMES = 20;
const AMPLITUDE = 20000;
const HOST = "127.0.0.1";

let sessions: RtpSession[] = [];
let probes: Socket[] = [];

afterEach(() => {
	for (const session of sessions) session.close();
	for (const probe of probes) probe.close();
	sessions = [];
	probes = [];
});

async function pair(): Promise<{ sender: RtpSession; receiver: RtpSession }> {
	const sender = await RtpSession.open({ stunHost: "" });
	const receiver = await RtpSession.open({ stunHost: "" });
	sessions.push(sender, receiver);

	return { sender, receiver };
}

async function probe(): Promise<Socket> {
	const socket = createSocket("udp4");

	await new Promise<void>((resolve) => {
		socket.bind(0, HOST, () => resolve());
	});

	probes.push(socket);
	return socket;
}

function portOf(socket: Socket): number {
	const address = socket.address();
	return typeof address === "string" ? 0 : address.port;
}

function rtpPacket(
	payloadType: number,
	seq: number,
	timestamp: number,
	ssrc: number,
	payload: Uint8Array,
): Buffer {
	const packet = Buffer.alloc(12 + payload.length);
	packet[0] = 0x80;
	packet[1] = payloadType & 0x7f;
	packet.writeUInt16BE(seq, 2);
	packet.writeUInt32BE(timestamp, 4);
	packet.writeUInt32BE(ssrc, 8);
	packet.set(payload, 12);
	return packet;
}

function tone(samples: number): Int16Array {
	const pcm = new Int16Array(samples);
	for (let i = 0; i < samples; i++) {
		pcm[i] = Math.round(Math.sin(i / 10) * 12000);
	}
	return pcm;
}

function noise(samples: number): Int16Array {
	const pcm = new Int16Array(samples);
	let state = 0x9e3779b9;

	for (let i = 0; i < samples; i++) {
		state = (state + 0x6d2b79f5) | 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		const unit = ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
		pcm[i] = Math.round((unit * 2 - 1) * AMPLITUDE);
	}

	return pcm;
}

function align(
	decoded: Int16Array,
	reference: Int16Array,
): { offset: number; score: number; maxError: number } {
	let best = { offset: -1, score: -1, maxError: Number.POSITIVE_INFINITY };
	let referenceEnergy = 0;
	for (const sample of reference) referenceEnergy += sample * sample;

	const last = decoded.length - reference.length;
	if (last < 0) return best;

	for (let offset = 0; offset <= last; offset++) {
		let dot = 0;
		let energy = 0;
		let maxError = 0;

		for (let i = 0; i < reference.length; i++) {
			const sample = decoded[offset + i] ?? 0;
			const expected = reference[i] ?? 0;
			dot += sample * expected;
			energy += sample * sample;
			maxError = Math.max(maxError, Math.abs(sample - expected));
		}

		const score = dot / Math.sqrt(energy * referenceEnergy || 1);
		if (score > best.score) best = { offset, score, maxError };
	}

	return best;
}

async function until(
	predicate: () => boolean,
	message: string,
	timeoutMs = 2000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out: ${message}`);
		await sleep(5);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RtpSession loopback", () => {
	it("reports a usable public address and a bound local port", async () => {
		const { sender, receiver } = await pair();

		for (const session of [sender, receiver]) {
			expect(session.publicAddress.ip).not.toBe("0.0.0.0");
			expect(session.publicAddress.ip).toMatch(
				/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
			);
			expect(session.publicAddress.port).toBeGreaterThan(0);
		}

		expect(sender.localPort).toBeGreaterThan(0);
		expect(receiver.localPort).toBeGreaterThan(0);
		expect(sender.localPort).not.toBe(receiver.localPort);
	});

	it("carries mu-law audio across the media path", async () => {
		const { sender, receiver } = await pair();
		const reference = noise(FRAMES * FRAME_SAMPLES);
		const wire = pcmToUlaw(reference);
		const codecNoise = maxError(ulawToPcm(wire), reference);

		const received: number[] = [];
		receiver.onInbound((pcm) => {
			for (const sample of pcm) received.push(sample);
		});

		sender.start({ ip: HOST, port: receiver.localPort });
		receiver.start({ ip: HOST, port: sender.localPort });
		sender.enqueue(wire);

		await sender.drain();
		expect(sender.stats.txPackets).toBe(FRAMES);

		await until(
			() => receiver.stats.rxPackets >= FRAMES,
			`received ${receiver.stats.rxPackets} of ${FRAMES} packets`,
		);

		const decoded = Int16Array.from(
			received.slice(0, FRAMES * FRAME_SAMPLES * 2),
		);
		const best = align(decoded, reference);

		expect(receiver.stats.rxPackets).toBeGreaterThan(0);
		expect(decoded.length).toBeGreaterThanOrEqual(reference.length);
		expect(best.offset).toBeLessThanOrEqual(FRAME_SAMPLES * 2);
		expect(best.score).toBeGreaterThan(0.99);
		expect(best.maxError).toBeLessThanOrEqual(codecNoise);
		expect(receiver.stats.peak).toBeGreaterThan(AMPLITUDE * 0.8);
	});

	it("stamps a well-formed RTP header on every packet", async () => {
		const { sender } = await pair();
		const socket = await probe();
		const captured: Buffer[] = [];
		socket.on("message", (message: Buffer) =>
			captured.push(Buffer.from(message)),
		);

		sender.start({ ip: HOST, port: portOf(socket) });
		sender.enqueue(pcmToUlaw(tone(FRAME_SAMPLES)));

		await sender.drain();
		await until(() => captured.length >= 5, "no packets captured");

		const first = captured[0] ?? Buffer.alloc(0);

		expect(first.length).toBe(12 + FRAME_SAMPLES);
		expect(first[0]).toBe(0x80);
		expect((first[1] ?? 0) & 0x7f).toBe(0);
		expect((first[1] ?? 0) & 0x80).toBe(0x80);

		const ssrc = first.readUInt32BE(8);
		let seq = first.readUInt16BE(2);
		let timestamp = first.readUInt32BE(4);

		for (const packet of captured.slice(1)) {
			expect(packet.length).toBe(12 + FRAME_SAMPLES);
			expect(packet[0]).toBe(0x80);
			expect(packet.readUInt32BE(8)).toBe(ssrc);
			expect(packet.readUInt16BE(2)).toBe((seq + 1) % 65536);
			expect(packet.readUInt32BE(4)).toBe((timestamp + 160) % 4294967296);
			expect((packet[1] ?? 0) & 0x80).toBe(0);

			seq = packet.readUInt16BE(2);
			timestamp = packet.readUInt32BE(4);
		}
	});

	it("latches onto the source of the first inbound packet", async () => {
		const { sender, receiver } = await pair();

		receiver.start({ ip: HOST, port: sender.localPort });
		sender.start({ ip: HOST, port: receiver.localPort });

		await until(
			() => receiver.stats.rxSource !== undefined,
			"no inbound packet",
		);

		expect(receiver.stats.rxSource).toBe(`${HOST}:${sender.localPort}`);
		expect(sender.stats.rxSource).toBe(`${HOST}:${receiver.localPort}`);
	});

	it("keeps transmitting silence when the queue is empty", async () => {
		const { sender, receiver } = await pair();

		sender.start({ ip: HOST, port: receiver.localPort });
		receiver.start({ ip: HOST, port: sender.localPort });

		await until(() => receiver.stats.rxPackets >= 3, "silence never arrived");

		expect(receiver.stats.peak).toBe(0);

		await sleep(100);

		expect(receiver.stats.rxPackets).toBeGreaterThanOrEqual(6);
		expect(receiver.stats.peak).toBe(0);
	});

	it("ignores RFC 2833 DTMF instead of decoding it", async () => {
		const { sender, receiver } = await pair();
		const socket = await probe();
		const ssrc = 0x11223344;
		const decoded: number[] = [];
		receiver.onInbound((pcm) => decoded.push(pcm.length));
		receiver.start({ ip: HOST, port: sender.localPort });

		const dtmf = rtpPacket(101, 7, 0, ssrc, new Uint8Array(4));
		socket.send(dtmf, receiver.localPort, HOST);
		await sleep(50);

		expect(receiver.stats.rxPackets).toBe(0);
		expect(decoded).toEqual([]);

		const audio = rtpPacket(0, 8, 160, ssrc, new Uint8Array(FRAME_SAMPLES));
		socket.send(audio, receiver.localPort, HOST);
		await until(() => receiver.stats.rxPackets === 1, "audio was not accepted");

		expect(decoded).toEqual([FRAME_SAMPLES]);

		socket.send(
			rtpPacket(101, 9, 320, ssrc, new Uint8Array(4)),
			receiver.localPort,
			HOST,
		);
		await sleep(50);

		expect(receiver.stats.rxPackets).toBe(1);
		expect(decoded).toEqual([FRAME_SAMPLES]);
	});

	it("pads a partial frame up to 20 ms", async () => {
		const { sender, receiver } = await pair();

		sender.start({ ip: HOST, port: receiver.localPort });
		receiver.start({ ip: HOST, port: sender.localPort });
		sender.enqueue(new Uint8Array([0x01, 0x02, 0x03]));

		await sender.drain();

		expect(sender.stats.txPackets).toBe(1);
	});

	it("splits a long buffer into 20 ms frames", async () => {
		const { sender, receiver } = await pair();
		const samples = FRAME_SAMPLES * 3 + 7;

		sender.start({ ip: HOST, port: receiver.localPort });
		receiver.start({ ip: HOST, port: sender.localPort });
		sender.enqueue(pcmToUlaw(noise(samples)));

		await sender.drain();

		expect(sender.stats.txPackets).toBe(4);
	});

	it("resolves drain immediately when nothing is queued", async () => {
		const { sender } = await pair();

		await sender.drain();

		expect(sender.stats.txPackets).toBe(0);
	});
});

function maxError(actual: Int16Array, expected: Int16Array): number {
	let worst = 0;

	for (let i = 0; i < expected.length; i++) {
		worst = Math.max(worst, Math.abs((actual[i] ?? 0) - (expected[i] ?? 0)));
	}

	return worst;
}
