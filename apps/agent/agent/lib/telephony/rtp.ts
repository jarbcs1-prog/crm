import { randomBytes } from "node:crypto";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { ulawToPcm } from "./audio";
import { getMappedAddress, localAddressFor } from "./stun";

const HEADER_LENGTH = 12;
const FRAME_BYTES = 160;
const FRAME_MS = 20;
const TIMESTAMP_STEP = 160;
const VERSION_2 = 0x80;
const MARKER_BIT = 0x80;
const PAYLOAD_TYPE_PCMU = 0;
const PAYLOAD_TYPE_DTMF = 101;
const SILENCE_BYTE = 0xff;
const SEQ_MODULO = 0x10000;
const SEQ_HALF = 0x8000;
const MAX_CATCHUP = 3;
const MAX_GAP_FRAMES = 25;
const DEFAULT_STUN_PORT = 3478;
const STUN_TIMEOUT_MS = 2000;
const ROUTE_PROBE_HOST = "8.8.8.8";
const ANY_ADDRESS = "0.0.0.0";
const LOOPBACK_ADDRESS = "127.0.0.1";

const SILENCE_FRAME = new Uint8Array(FRAME_BYTES).fill(SILENCE_BYTE);

export type RtpEndpoint = {
	ip: string;
	port: number;
};

export type RtpStats = {
	txPackets: number;
	rxPackets: number;
	rxSource?: string;
	peak: number;
};

export type RtpOptions = {
	stunHost?: string;
	stunPort?: number;
};

export class RtpSession {
	readonly stats: RtpStats = { txPackets: 0, rxPackets: 0, peak: 0 };

	private readonly socket: Socket;
	private readonly stunHost: string;
	private readonly stunPort: number;
	private readonly ssrc: number;
	private readonly queue: Uint8Array[] = [];
	private readonly drainWaiters: Array<() => void> = [];
	private publicAddr: RtpEndpoint = { ip: LOOPBACK_ADDRESS, port: 0 };
	private target: RtpEndpoint | undefined;
	private advertised: RtpEndpoint | undefined;
	private inbound: ((pcm: Int16Array) => void) | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private nextAt = 0;
	private seq = 0;
	private timestamp = 0;
	private speaking = false;
	private expectedSeq: number | undefined;
	private rxSsrc: number | undefined;
	private closed = false;

	private constructor(socket: Socket, stunHost: string, stunPort: number) {
		this.socket = socket;
		this.stunHost = stunHost;
		this.stunPort = stunPort;
		this.ssrc = randomBytes(4).readUInt32BE(0);
		this.seq = randomBytes(2).readUInt16BE(0);
		this.timestamp = randomBytes(4).readUInt32BE(0);
	}

	static async open(opts: RtpOptions = {}): Promise<RtpSession> {
		const stunHost = opts.stunHost ?? process.env.NONOH_STUN_SERVER ?? "";
		const stunPort = numberFrom(
			opts.stunPort ?? process.env.NONOH_STUN_PORT,
			DEFAULT_STUN_PORT,
		);
		const socket = createSocket("udp4");

		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => reject(error);
			socket.once("error", onError);
			socket.bind(0, ANY_ADDRESS, () => {
				socket.off("error", onError);
				resolve();
			});
		});

		const session = new RtpSession(socket, stunHost, stunPort);

		try {
			session.publicAddr = await session.resolvePublicAddress();
		} catch (error) {
			session.close();
			throw error;
		}

		socket.on("message", (message: Buffer, rinfo: RemoteInfo) => {
			session.receive(message, rinfo);
		});
		socket.on("error", () => {});

		return session;
	}

	get publicAddress(): RtpEndpoint {
		return { ...this.publicAddr };
	}

	get localPort(): number {
		const address = this.socket.address();
		return typeof address === "string" ? 0 : address.port;
	}

	start(remote: RtpEndpoint): void {
		if (this.closed) return;

		this.advertised = { ...remote };
		this.target = { ...remote };

		if (this.timer !== undefined) return;

		this.nextAt = performance.now();
		this.schedule();
	}

	enqueue(pcmu: Uint8Array): void {
		if (this.closed || pcmu.length === 0) return;

		for (let at = 0; at < pcmu.length; at += FRAME_BYTES) {
			const frame = new Uint8Array(FRAME_BYTES).fill(SILENCE_BYTE);
			frame.set(pcmu.subarray(at, Math.min(at + FRAME_BYTES, pcmu.length)));
			this.queue.push(frame);
		}
	}

	onInbound(cb: (pcm: Int16Array) => void): void {
		this.inbound = cb;
	}

	async drain(): Promise<void> {
		if (this.closed || this.queue.length === 0) return;
		await new Promise<void>((resolve) => {
			this.drainWaiters.push(resolve);
		});
	}

	close(): void {
		if (this.closed) return;

		this.closed = true;
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		this.queue.length = 0;
		this.releaseDrain();

		try {
			this.socket.close();
		} catch {
			return;
		}
	}

	private async resolvePublicAddress(): Promise<RtpEndpoint> {
		const localPort = this.localPort;

		if (this.stunHost) {
			const mapped = await getMappedAddress(
				this.socket,
				this.stunHost,
				this.stunPort,
				STUN_TIMEOUT_MS,
			);

			if (mapped?.ip && mapped.ip !== ANY_ADDRESS) {
				return { ip: mapped.ip, port: mapped.port || localPort };
			}
		}

		return { ip: await this.localIp(), port: localPort };
	}

	private async localIp(): Promise<string> {
		try {
			const ip = await localAddressFor(
				this.stunHost || ROUTE_PROBE_HOST,
				this.stunPort,
			);
			if (ip && ip !== ANY_ADDRESS) return ip;
		} catch {
			return hostAddress();
		}

		return hostAddress();
	}

	private schedule(): void {
		const delay = Math.max(0, this.nextAt - performance.now());
		this.timer = setTimeout(() => this.tick(), delay);
	}

	private tick(): void {
		this.timer = undefined;
		if (this.closed) return;

		const now = performance.now();
		let sent = 0;

		while (this.nextAt <= now && sent < MAX_CATCHUP) {
			this.sendFrame();
			this.nextAt += FRAME_MS;
			sent += 1;
		}

		if (this.nextAt <= now) this.nextAt = now + FRAME_MS;

		this.schedule();
	}

	private sendFrame(): void {
		const target = this.target;
		if (!target || target.port === 0) return;

		const frame = this.queue.shift() ?? SILENCE_FRAME;
		const marker = frame !== SILENCE_FRAME && !this.speaking;
		this.speaking = frame !== SILENCE_FRAME;

		const packet = Buffer.alloc(HEADER_LENGTH + frame.length);
		packet[0] = VERSION_2;
		packet[1] = (marker ? MARKER_BIT : 0) | PAYLOAD_TYPE_PCMU;
		packet.writeUInt16BE(this.seq, 2);
		packet.writeUInt32BE(this.timestamp, 4);
		packet.writeUInt32BE(this.ssrc, 8);
		packet.set(frame, HEADER_LENGTH);

		this.seq = (this.seq + 1) % SEQ_MODULO;
		this.timestamp = (this.timestamp + TIMESTAMP_STEP) >>> 0;
		this.stats.txPackets += 1;

		try {
			this.socket.send(packet, target.port, target.ip);
		} catch {
			return;
		}

		if (this.queue.length === 0) this.releaseDrain();
	}

	private receive(message: Buffer, rinfo: RemoteInfo): void {
		if (this.closed) return;
		if (message.length < HEADER_LENGTH) return;

		const first = message[0] ?? 0;
		if ((first & 0xc0) !== VERSION_2) return;

		const payloadType = (message[1] ?? 0) & 0x7f;
		if (payloadType === PAYLOAD_TYPE_DTMF) return;
		if (payloadType !== PAYLOAD_TYPE_PCMU) return;

		const ssrc = message.readUInt32BE(8);
		if (this.rxSsrc === undefined) this.rxSsrc = ssrc;
		else if (ssrc !== this.rxSsrc) return;

		this.latch(rinfo, ssrc);

		const seq = message.readUInt16BE(2);
		if (!this.order(seq)) return;

		this.stats.rxPackets += 1;

		const pcm = ulawToPcm(message.subarray(HEADER_LENGTH));
		for (const sample of pcm) {
			const magnitude = Math.abs(sample);
			if (magnitude > this.stats.peak) this.stats.peak = magnitude;
		}

		this.inbound?.(pcm);
	}

	private latch(rinfo: RemoteInfo, ssrc: number): void {
		if (!rinfo?.address || !rinfo.port) return;

		const source = `${rinfo.address}:${rinfo.port}`;
		if (this.stats.rxSource === source) return;
		if (this.stats.rxSource !== undefined && ssrc !== this.rxSsrc) return;

		this.stats.rxSource = source;
		if (this.advertised === undefined || source !== key(this.advertised)) {
			this.target = { ip: rinfo.address, port: rinfo.port };
		}
	}

	private order(seq: number): boolean {
		if (this.expectedSeq !== undefined) {
			const delta = (seq - this.expectedSeq + SEQ_MODULO) % SEQ_MODULO;

			if (delta >= SEQ_HALF) return false;

			if (delta > 0 && delta <= MAX_GAP_FRAMES) {
				this.inbound?.(new Int16Array(delta * FRAME_BYTES));
			}
		}

		this.expectedSeq = (seq + 1) % SEQ_MODULO;
		return true;
	}

	private releaseDrain(): void {
		while (this.drainWaiters.length > 0) {
			const waiter = this.drainWaiters.pop();
			waiter?.();
		}
	}
}

function key(endpoint: RtpEndpoint): string {
	return `${endpoint.ip}:${endpoint.port}`;
}

function numberFrom(
	value: string | number | undefined,
	fallback: number,
): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hostAddress(): string {
	const interfaces = networkInterfaces();

	for (const entries of Object.values(interfaces)) {
		for (const entry of entries ?? []) {
			if (entry.family === "IPv4" && !entry.internal) return entry.address;
		}
	}

	return LOOPBACK_ADDRESS;
}
