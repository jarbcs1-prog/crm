import { randomBytes } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";

const MAGIC_COOKIE = 0x2112a442;
const COOKIE_BYTES = Buffer.from([0x21, 0x12, 0xa4, 0x42]);
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const ATTR_MAPPED_ADDRESS = 0x0001;
const ATTR_XOR_MAPPED_ADDRESS = 0x0020;
const HEADER_LENGTH = 20;
const TRANSACTION_ID_LENGTH = 12;
const FAMILY_IPV4 = 0x01;
const FAMILY_IPV6 = 0x02;

export type MappedAddress = {
	ip: string;
	port: number;
};

export async function getMappedAddress(
	socket: Socket,
	host: string,
	port = 3478,
	timeoutMs = 3000,
): Promise<MappedAddress | null> {
	const transactionId = randomBytes(TRANSACTION_ID_LENGTH);
	const request = buildBindingRequest(transactionId);

	return new Promise<MappedAddress | null>((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let settled = false;

		const finish = (value: MappedAddress | null) => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			socket.off("message", onMessage);
			socket.off("error", onError);
			resolve(value);
		};

		timer = setTimeout(() => finish(null), timeoutMs);
		socket.on("message", onMessage);
		socket.on("error", onError);

		try {
			socket.send(request, port, host, (error) => {
				if (error) finish(null);
			});
		} catch {
			finish(null);
		}

		function onMessage(message: Buffer) {
			const mapped = parseBindingResponse(message, transactionId);
			if (mapped) finish(mapped);
		}

		function onError() {
			finish(null);
		}
	});
}

export function parseBindingResponse(
	message: Buffer,
	transactionId: Buffer,
): MappedAddress | null {
	if (message.length < HEADER_LENGTH) return null;
	if (message.readUInt16BE(0) !== BINDING_SUCCESS) return null;
	if (message.readUInt32BE(4) !== MAGIC_COOKIE) return null;
	if (!message.subarray(8, HEADER_LENGTH).equals(transactionId)) return null;

	let plain: MappedAddress | null = null;
	let offset = HEADER_LENGTH;

	while (offset + 4 <= message.length) {
		const type = message.readUInt16BE(offset);
		const length = message.readUInt16BE(offset + 2);
		const start = offset + 4;
		const value = message.subarray(
			start,
			Math.min(start + length, message.length),
		);
		offset = start + length + ((4 - (length % 4)) % 4);

		if (type === ATTR_XOR_MAPPED_ADDRESS) {
			const xor = decodeXorMappedAddress(value, transactionId);
			if (xor) return xor;
		} else if (type === ATTR_MAPPED_ADDRESS) {
			plain = decodeMappedAddress(value) ?? plain;
		}
	}

	return plain;
}

export async function localAddressFor(
	host: string,
	port: number,
): Promise<string> {
	const socket = createSocket("udp4");

	try {
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => reject(error);
			socket.once("error", onError);
			socket.bind(0, () => {
				socket.off("error", onError);
				resolve();
			});
		});
		socket.connect(port, host);
		return socket.address().address;
	} finally {
		socket.close();
	}
}

function buildBindingRequest(transactionId: Buffer): Buffer {
	const request = Buffer.alloc(HEADER_LENGTH);
	request.writeUInt16BE(BINDING_REQUEST, 0);
	request.writeUInt16BE(0, 2);
	request.writeUInt32BE(MAGIC_COOKIE, 4);
	transactionId.copy(request, 8);
	return request;
}

function decodeMappedAddress(value: Buffer): MappedAddress | null {
	if (value.length < 4) return null;
	const family = value.readUInt8(1);
	const port = value.readUInt16BE(2);

	if (family === FAMILY_IPV4) {
		if (value.length < 8) return null;
		return {
			ip: `${value.readUInt8(4)}.${value.readUInt8(5)}.${value.readUInt8(6)}.${value.readUInt8(7)}`,
			port,
		};
	}

	if (family === FAMILY_IPV6) {
		if (value.length < 20) return null;
		return { ip: formatIpv6(value.subarray(4, 20)), port };
	}

	return null;
}

function decodeXorMappedAddress(
	value: Buffer,
	transactionId: Buffer,
): MappedAddress | null {
	if (value.length < 4) return null;
	const family = value.readUInt8(1);
	const port = value.readUInt16BE(2) ^ (MAGIC_COOKIE >>> 16);

	if (family === FAMILY_IPV4) {
		if (value.length < 8) return null;
		const octets: number[] = [];
		for (let i = 0; i < 4; i++) {
			const mask = COOKIE_BYTES.readUInt8(i);
			octets.push(value.readUInt8(4 + i) ^ mask);
		}
		return { ip: octets.join("."), port };
	}

	if (family === FAMILY_IPV6) {
		if (value.length < 20) return null;
		const key = Buffer.concat([COOKIE_BYTES, transactionId]);
		const address = Buffer.alloc(16);
		for (let i = 0; i < 16; i++) {
			address.writeUInt8(value.readUInt8(4 + i) ^ key.readUInt8(i), i);
		}
		return { ip: formatIpv6(address), port };
	}

	return null;
}

function formatIpv6(bytes: Buffer): string {
	const groups: string[] = [];
	for (let i = 0; i < 8; i++) {
		groups.push(bytes.readUInt16BE(i * 2).toString(16));
	}

	let bestStart = -1;
	let bestLength = 0;
	let runStart = -1;
	let runLength = 0;

	for (let i = 0; i < 8; i++) {
		if (groups[i] === "0") {
			runLength = runStart === -1 ? 1 : runLength + 1;
			if (runStart === -1) runStart = i;
			if (runLength > bestLength) {
				bestLength = runLength;
				bestStart = runStart;
			}
		} else {
			runStart = -1;
			runLength = 0;
		}
	}

	if (bestLength < 2) return groups.join(":");

	const head = groups.slice(0, bestStart).join(":");
	const tail = groups.slice(bestStart + bestLength).join(":");
	return `${head}::${tail}`;
}
