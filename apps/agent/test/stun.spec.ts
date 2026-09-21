import { describe, expect, it } from "bun:test";
import { createSocket, type Socket } from "node:dgram";
import { EventEmitter } from "node:events";
import {
	getMappedAddress,
	localAddressFor,
	parseBindingResponse,
} from "../agent/lib/telephony/stun";

const MAGIC_COOKIE = 0x2112a442;
const TRANSACTION_ID = Buffer.from("000102030405060708090a0b", "hex");
const OTHER_TRANSACTION_ID = Buffer.from("ffffffffffffffffffffffff", "hex");
const IP = "203.0.113.7";
const PORT = 45678;

class StubSocket extends EventEmitter {
	readonly sent: Buffer[] = [];
	readonly reply: ((buf: Buffer, socket: StubSocket) => void) | undefined;

	constructor(reply?: (buf: Buffer, socket: StubSocket) => void) {
		super();
		this.reply = reply;
	}

	send(
		buf: Buffer,
		_port: number,
		_host: string,
		cb?: (error: Error | null) => void,
	) {
		this.sent.push(buf);
		this.reply?.(buf, this);
		cb?.(null);
		return this;
	}

	close() {
		return this;
	}
}

function addressValue(ip: string, port: number, xor: boolean): Buffer {
	const value = Buffer.alloc(8);
	value.writeUInt8(0x01, 1);
	value.writeUInt16BE(xor ? port ^ 0x2112 : port, 2);

	const octets = ip.split(".").map((part) => Number(part));

	for (let i = 0; i < 4; i++) {
		const mask = (MAGIC_COOKIE >>> (24 - i * 8)) & 0xff;
		const octet = octets[i] ?? 0;
		value.writeUInt8(xor ? octet ^ mask : octet, 4 + i);
	}

	return value;
}

function attribute(type: number, value: Buffer): Buffer {
	const padding = (4 - (value.length % 4)) % 4;
	const out = Buffer.alloc(4 + value.length + padding);
	out.writeUInt16BE(type, 0);
	out.writeUInt16BE(value.length, 2);
	value.copy(out, 4);
	return out;
}

function response(
	attributes: readonly Buffer[],
	transactionId: Buffer = TRANSACTION_ID,
	type = 0x0101,
): Buffer {
	const body = Buffer.concat(attributes);
	const header = Buffer.alloc(20);
	header.writeUInt16BE(type, 0);
	header.writeUInt16BE(body.length, 2);
	header.writeUInt32BE(MAGIC_COOKIE, 4);
	transactionId.copy(header, 8);
	return Buffer.concat([header, body]);
}

describe("parseBindingResponse", () => {
	it("reads a plain MAPPED-ADDRESS", () => {
		const message = response([
			attribute(0x0001, addressValue(IP, PORT, false)),
		]);

		expect(parseBindingResponse(message, TRANSACTION_ID)).toEqual({
			ip: IP,
			port: PORT,
		});
	});

	it("reads an XOR-MAPPED-ADDRESS", () => {
		const message = response([attribute(0x0020, addressValue(IP, PORT, true))]);

		expect(parseBindingResponse(message, TRANSACTION_ID)).toEqual({
			ip: IP,
			port: PORT,
		});
	});

	it("prefers the XOR form when both are present", () => {
		const message = response([
			attribute(0x0001, addressValue("10.0.0.1", 1234, false)),
			attribute(0x0020, addressValue(IP, PORT, true)),
		]);

		expect(parseBindingResponse(message, TRANSACTION_ID)).toEqual({
			ip: IP,
			port: PORT,
		});
	});

	it("walks past padded attributes", () => {
		const message = response([
			attribute(0x0022, Buffer.from([1, 2, 3])),
			attribute(0x0001, addressValue(IP, PORT, false)),
		]);

		expect(parseBindingResponse(message, TRANSACTION_ID)).toEqual({
			ip: IP,
			port: PORT,
		});
	});

	it("ignores a mismatched transaction id", () => {
		const message = response(
			[attribute(0x0020, addressValue(IP, PORT, true))],
			OTHER_TRANSACTION_ID,
		);

		expect(parseBindingResponse(message, TRANSACTION_ID)).toBeNull();
	});

	it("ignores anything that is not a binding success", () => {
		const message = response(
			[attribute(0x0020, addressValue(IP, PORT, true))],
			TRANSACTION_ID,
			0x0111,
		);

		expect(parseBindingResponse(message, TRANSACTION_ID)).toBeNull();
	});

	it("ignores a truncated message", () => {
		expect(parseBindingResponse(Buffer.alloc(8), TRANSACTION_ID)).toBeNull();
	});
});

describe("getMappedAddress", () => {
	it("sends a 20-byte binding request", async () => {
		const socket = new StubSocket();
		const mapped = await getMappedAddress(
			socket as unknown as Socket,
			"stun.example",
			3478,
			50,
		);

		expect(mapped).toBeNull();
		expect(socket.sent).toHaveLength(1);

		const request = socket.sent[0] ?? Buffer.alloc(0);

		expect(request.length).toBe(20);
		expect(request.readUInt16BE(0)).toBe(0x0001);
		expect(request.readUInt16BE(2)).toBe(0);
		expect(request.readUInt32BE(4)).toBe(MAGIC_COOKIE);
	});

	it("resolves the address from a matching response", async () => {
		const socket = new StubSocket((buf, self) => {
			self.emit(
				"message",
				response(
					[attribute(0x0020, addressValue(IP, PORT, true))],
					buf.subarray(8, 20),
				),
			);
		});

		const mapped = await getMappedAddress(
			socket as unknown as Socket,
			"stun.example",
			3478,
			1000,
		);

		expect(mapped).toEqual({ ip: IP, port: PORT });
	});

	it("resolves the address from the plain form", async () => {
		const socket = new StubSocket((buf, self) => {
			self.emit(
				"message",
				response(
					[attribute(0x0001, addressValue(IP, PORT, false))],
					buf.subarray(8, 20),
				),
			);
		});

		const mapped = await getMappedAddress(
			socket as unknown as Socket,
			"stun.example",
			3478,
			1000,
		);

		expect(mapped).toEqual({ ip: IP, port: PORT });
	});

	it("keeps waiting until the timeout when nothing matches", async () => {
		const socket = new StubSocket((_buf, self) => {
			self.emit("message", Buffer.alloc(4));
			self.emit(
				"message",
				response(
					[attribute(0x0001, addressValue(IP, PORT, false))],
					OTHER_TRANSACTION_ID,
				),
			);
		});

		const mapped = await getMappedAddress(
			socket as unknown as Socket,
			"stun.example",
			3478,
			60,
		);

		expect(mapped).toBeNull();
	});

	it("resolves null when the socket cannot send", async () => {
		const socket = new StubSocket();
		const broken = {
			on: socket.on.bind(socket),
			off: socket.off.bind(socket),
			send: (
				_buf: Buffer,
				_port: number,
				_host: string,
				cb?: (error: Error | null) => void,
			) => cb?.(new Error("closed")),
		};

		expect(
			await getMappedAddress(
				broken as unknown as Socket,
				"stun.example",
				3478,
				500,
			),
		).toBeNull();
	});
});

describe("localAddressFor", () => {
	it("reports the source address the OS would pick", async () => {
		const ip = await localAddressFor("127.0.0.1", 3478);

		expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
	});
});

describe("live", () => {
	const live = process.env.STUN_LIVE === "1";

	it.skipIf(!live)(
		"resolves a public mapped address from stun.nonoh.net",
		async () => {
			const socket = createSocket("udp4");

			try {
				await new Promise<void>((resolve, reject) => {
					socket.once("error", reject);
					socket.bind(0, () => {
						socket.off("error", reject);
						resolve();
					});
				});

				const mapped = await getMappedAddress(
					socket,
					"stun.nonoh.net",
					3478,
					4000,
				);

				if (!mapped) return;

				expect(mapped.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
				expect(mapped.port).toBeGreaterThan(0);
			} finally {
				socket.close();
			}
		},
		15000,
	);
});
