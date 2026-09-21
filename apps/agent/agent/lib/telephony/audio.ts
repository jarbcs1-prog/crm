const BIAS = 0x84;
const CLIP = 32635;
const REQUIRED_SAMPLE_RATE = 8000;
const FORMAT_PCM = 1;
const FORMAT_IEEE_FLOAT = 3;
const RIFF_HEADER_LENGTH = 44;

const EXPONENT_LUT = [
	0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
	4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
	5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
	6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
	6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7,
	7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
	7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
	7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
	7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
	7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
];

export type WavAudio = {
	sampleRate: number;
	channels: number;
	pcm: Int16Array;
};

export function readWav(buf: Buffer): WavAudio {
	if (buf.length < 12) throw new Error("not a RIFF/WAVE file: truncated");

	if (buf.toString("ascii", 0, 4) !== "RIFF") {
		throw new Error("not a RIFF/WAVE file: missing RIFF tag");
	}

	if (buf.toString("ascii", 8, 12) !== "WAVE") {
		throw new Error("not a RIFF/WAVE file: missing WAVE tag");
	}

	let format = 0;
	let channels = 0;
	let sampleRate = 0;
	let bitsPerSample = 0;
	let data: Buffer | undefined;
	let offset = 12;

	while (offset + 8 <= buf.length) {
		const id = buf.toString("ascii", offset, offset + 4);
		const size = buf.readUInt32LE(offset + 4);
		const body = offset + 8;
		const end = Math.min(body + size, buf.length);

		if (id === "fmt ") {
			if (end - body < 16) throw new Error("WAVE fmt chunk is truncated");
			format = buf.readUInt16LE(body);
			channels = buf.readUInt16LE(body + 2);
			sampleRate = buf.readUInt32LE(body + 4);
			bitsPerSample = buf.readUInt16LE(body + 14);
		} else if (id === "data") {
			data = buf.subarray(body, end);
		}

		offset = body + size + (size % 2);
	}

	if (format === 0) throw new Error("WAVE file has no fmt chunk");

	if (sampleRate !== REQUIRED_SAMPLE_RATE) {
		throw new Error(
			`WAVE sample rate must be ${REQUIRED_SAMPLE_RATE} Hz, got ${sampleRate} Hz; resample explicitly before reading`,
		);
	}

	if (!data) throw new Error("WAVE file has no data chunk");

	if (format === FORMAT_PCM) {
		if (bitsPerSample !== 16) {
			throw new Error(`unsupported WAVE PCM bit depth: ${bitsPerSample}`);
		}
		return { sampleRate, channels, pcm: readInt16(data) };
	}

	if (format === FORMAT_IEEE_FLOAT) {
		if (bitsPerSample !== 32) {
			throw new Error(`unsupported WAVE float bit depth: ${bitsPerSample}`);
		}
		return { sampleRate, channels, pcm: readFloat32(data) };
	}

	throw new Error(`unsupported WAVE format: ${format}`);
}

export function encodeWav(pcm: Int16Array, sampleRate = 8000): Buffer {
	const dataLength = pcm.length * 2;
	const buf = Buffer.alloc(RIFF_HEADER_LENGTH + dataLength);

	buf.write("RIFF", 0, "ascii");
	buf.writeUInt32LE(36 + dataLength, 4);
	buf.write("WAVE", 8, "ascii");
	buf.write("fmt ", 12, "ascii");
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(FORMAT_PCM, 20);
	buf.writeUInt16LE(1, 22);
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write("data", 36, "ascii");
	buf.writeUInt32LE(dataLength, 40);

	let at = RIFF_HEADER_LENGTH;
	for (const sample of pcm) {
		buf.writeInt16LE(sample, at);
		at += 2;
	}

	return buf;
}

export function pcmToUlaw(pcm: Int16Array): Uint8Array {
	const out = new Uint8Array(pcm.length);
	let at = 0;
	for (const sample of pcm) {
		out[at] = linearToUlaw(sample);
		at += 1;
	}
	return out;
}

export function ulawToPcm(u: Uint8Array): Int16Array {
	const out = new Int16Array(u.length);
	let at = 0;
	for (const byte of u) {
		out[at] = ulawToLinear(byte);
		at += 1;
	}
	return out;
}

export function rms(pcm: Int16Array): number {
	if (pcm.length === 0) return 0;

	let sum = 0;
	for (const sample of pcm) sum += sample * sample;

	return Math.sqrt(sum / pcm.length);
}

function linearToUlaw(sample: number): number {
	let sign = 0;
	let magnitude = sample;

	if (magnitude < 0) {
		sign = 0x80;
		magnitude = -magnitude;
	}

	if (magnitude > CLIP) magnitude = CLIP;
	magnitude += BIAS;

	const exponent = EXPONENT_LUT[(magnitude >> 7) & 0xff] ?? 7;
	const mantissa = (magnitude >> (exponent + 3)) & 0x0f;

	return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function ulawToLinear(byte: number): number {
	const value = ~byte & 0xff;
	const exponent = (value & 0x70) >> 4;
	const mantissa = value & 0x0f;
	const magnitude = ((mantissa << 3) + BIAS) << exponent;

	return (value & 0x80) !== 0 ? BIAS - magnitude : magnitude - BIAS;
}

function readInt16(data: Buffer): Int16Array {
	const count = Math.floor(data.length / 2);
	const pcm = new Int16Array(count);

	for (let i = 0; i < count; i++) pcm[i] = data.readInt16LE(i * 2);

	return pcm;
}

function readFloat32(data: Buffer): Int16Array {
	const count = Math.floor(data.length / 4);
	const pcm = new Int16Array(count);

	for (let i = 0; i < count; i++) {
		const scaled = data.readFloatLE(i * 4) * 32767;
		pcm[i] = Math.max(-32768, Math.min(32767, Math.round(scaled)));
	}

	return pcm;
}
