import { randomBytes } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";
import { getHeader, parseSipMessage, type SipMessage } from "./sip-protocol";
import { getMappedAddress, localAddressFor } from "./stun";

const DEFAULT_SIP_PORT = 5060;
const DEFAULT_STUN_PORT = 3478;
const STUN_TIMEOUT_MS = 3000;

export interface TransportAddress {
	ip: string;
	port: number;
}

export interface SipServerConfig {
	server: string;
	port: number;
	stunServer?: string;
	stunPort: number;
}

export interface TransactionMeta {
	branch: string;
	method: string;
}

interface PendingTransaction {
	method: string;
	resolve: (message: SipMessage | null) => void;
	timer: ReturnType<typeof setTimeout>;
	onProvisional?: (message: SipMessage) => void;
}

export function readSipServerConfig(): SipServerConfig {
	const server = process.env.NONOH_SIP_SERVER?.trim() ?? "";
	const stunServer = process.env.NONOH_STUN_SERVER?.trim() ?? "";
	const port = Number.parseInt(process.env.NONOH_SIP_PORT ?? "", 10);
	const stunPort = Number.parseInt(process.env.NONOH_STUN_PORT ?? "", 10);

	return {
		server,
		port: Number.isNaN(port) ? DEFAULT_SIP_PORT : port,
		stunServer: stunServer.length > 0 ? stunServer : undefined,
		stunPort: Number.isNaN(stunPort) ? DEFAULT_STUN_PORT : stunPort,
	};
}

export function newBranch(): string {
	return `z9hG4bK${randomBytes(10).toString("hex")}`;
}

function transactionKey(branch: string, method: string): string {
	return `${branch}|${method.toUpperCase()}`;
}

function branchOf(via: string | undefined): string | undefined {
	if (!via) return undefined;
	for (const part of via.split(";")) {
		const trimmed = part.trim();
		if (trimmed.toLowerCase().startsWith("branch=")) {
			return trimmed.slice("branch=".length);
		}
	}
	return undefined;
}

function methodOfCSeq(cseq: string | undefined): string | undefined {
	if (!cseq) return undefined;
	const fields = cseq.trim().split(/\s+/);
	return fields.length < 2 ? undefined : fields[1]?.toUpperCase();
}

export class SipTransport {
	private readonly socket: Socket;
	private readonly config: SipServerConfig;
	private readonly address: TransportAddress;
	private readonly addressSource: "stun" | "local";
	private readonly transactions = new Map<string, PendingTransaction>();
	private provisionalHandler: ((message: SipMessage) => void) | undefined;
	private closed = false;

	private constructor(
		socket: Socket,
		config: SipServerConfig,
		address: TransportAddress,
		addressSource: "stun" | "local",
	) {
		this.socket = socket;
		this.config = config;
		this.address = address;
		this.addressSource = addressSource;
		socket.on("message", (data: Buffer) => this.onDatagram(data));
		socket.on("error", () => {});
	}

	static async open(
		config: SipServerConfig = readSipServerConfig(),
	): Promise<SipTransport> {
		const socket = createSocket("udp4");

		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				socket.off("error", onError);
				reject(error);
			};
			socket.once("error", onError);
			socket.bind(0, () => {
				socket.off("error", onError);
				resolve();
			});
		});

		const localPort = socket.address().port;
		const mapped = config.stunServer
			? await getMappedAddress(
					socket,
					config.stunServer,
					config.stunPort,
					STUN_TIMEOUT_MS,
				)
			: null;

		if (mapped) {
			return new SipTransport(socket, config, mapped, "stun");
		}

		const fallbackHost = config.server.length > 0 ? config.server : "127.0.0.1";
		const localIp = await localAddressFor(fallbackHost, config.port).catch(
			() => "",
		);

		return new SipTransport(
			socket,
			config,
			{
				ip: localIp.length > 0 ? localIp : "127.0.0.1",
				port: localPort,
			},
			"local",
		);
	}

	get publicAddress(): TransportAddress {
		return this.address;
	}

	get source(): "stun" | "local" {
		return this.addressSource;
	}

	get server(): string {
		return this.config.server;
	}

	get serverPort(): number {
		return this.config.port;
	}

	get isClosed(): boolean {
		return this.closed;
	}

	setProvisionalHandler(
		handler: ((message: SipMessage) => void) | undefined,
	): void {
		this.provisionalHandler = handler;
	}

	send(message: string): void {
		if (this.closed || this.config.server.length === 0) return;
		const payload = Buffer.from(message, "utf8");
		try {
			this.socket.send(payload, this.config.port, this.config.server, () => {});
		} catch {}
	}

	request(
		message: string,
		meta: TransactionMeta,
		timeoutMs: number,
		onProvisional?: (message: SipMessage) => void,
	): Promise<SipMessage | null> {
		if (this.closed) return Promise.resolve(null);

		const key = transactionKey(meta.branch, meta.method);

		return new Promise<SipMessage | null>((resolve) => {
			const timer = setTimeout(() => {
				this.transactions.delete(key);
				resolve(null);
			}, timeoutMs);

			this.transactions.set(key, {
				method: meta.method.toUpperCase(),
				resolve,
				timer,
				onProvisional,
			});

			this.send(message);
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;

		for (const pending of this.transactions.values()) {
			clearTimeout(pending.timer);
			pending.resolve(null);
		}
		this.transactions.clear();
		this.provisionalHandler = undefined;

		this.socket.removeAllListeners("message");
		this.socket.removeAllListeners("error");
		try {
			this.socket.close();
		} catch {}
	}

	private onDatagram(data: Buffer): void {
		const raw = data.toString("utf8");
		if (!raw.startsWith("SIP/")) return;

		const message = parseSipMessage(raw);
		if (!message.isResponse) return;

		const branch = branchOf(getHeader(message, "via"));
		const method = methodOfCSeq(getHeader(message, "cseq"));
		if (!branch || !method) return;

		const pending = this.transactions.get(transactionKey(branch, method));
		if (!pending) return;

		if (message.status < 200) {
			pending.onProvisional?.(message);
			this.provisionalHandler?.(message);
			return;
		}

		clearTimeout(pending.timer);
		this.transactions.delete(transactionKey(branch, method));
		pending.resolve(message);
	}
}
