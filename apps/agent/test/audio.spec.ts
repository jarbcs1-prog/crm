import { describe, expect, it } from "bun:test";
import {
	encodeWav,
	pcmToUlaw,
	readWav,
	rms,
	ulawToPcm,
} from "../agent/lib/telephony/audio";

function ulawOf(sample: number): number {
	return pcmToUlaw(Int16Array.of(sample))[0] ?? 0;
}

function pcmOf(byte: number): number {
	return ulawToPcm(Uint8Array.of(byte))[0] ?? 0;
}

function encodeFloatWav(
	samples: readonly number[],
	sampleRate: number,
): Buffer {
	const dataLength = samples.length * 4;
	const buf = Buffer.alloc(44 + dataLength);

	buf.write("RIFF", 0, "ascii");
	buf.writeUInt32LE(36 + dataLength, 4);
	buf.write("WAVE", 8, "ascii");
	buf.write("fmt ", 12, "ascii");
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(3, 20);
	buf.writeUInt16LE(1, 22);
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(32, 34);
	buf.write("data", 36, "ascii");
	buf.writeUInt32LE(dataLength, 40);

	for (const [i, sample] of samples.entries()) {
		buf.writeFloatLE(sample, 44 + i * 4);
	}

	return buf;
}

describe("G.711 mu-law", () => {
	it("encodes the known vectors", () => {
		expect(ulawOf(0)).toBe(0xff);
		expect(ulawOf(32124)).toBe(0x80);
		expect(ulawOf(-32124)).toBe(0x00);
		expect(ulawOf(1000)).toBe(0xce);
		expect(ulawOf(-1000)).toBe(0x4e);
		expect(ulawOf(3000)).toBe(0xb7);
		expect(ulawOf(-3000)).toBe(0x37);
	});

	it("decodes the known vectors", () => {
		expect(pcmOf(0xff)).toBe(0);
		expect(pcmOf(0x80)).toBe(32124);
		expect(pcmOf(0x00)).toBe(-32124);
	});

	it("encodes digital silence as 0xff", () => {
		const encoded = pcmToUlaw(new Int16Array(16));
		expect([...encoded]).toEqual(Array(16).fill(0xff));
	});

	it("round-trips within one quantization step", () => {
		let worst = 0;

		for (let sample = -32768; sample <= 32767; sample++) {
			const byte = ulawOf(sample);
			const back = pcmOf(byte);
			const step = 8 << ((~byte & 0x70) >> 4);

			expect(Math.abs(back - sample)).toBeLessThan(step);
			worst = Math.max(worst, Math.abs(back - sample));
		}

		expect(worst).toBeLessThanOrEqual(644);
	});

	it("keeps the sign across the codec", () => {
		const pcm = Int16Array.from([-20000, -500, -100, 100, 500, 20000]);
		const back = ulawToPcm(pcmToUlaw(pcm));

		for (let i = 0; i < pcm.length; i++) {
			expect(Math.sign(back[i] ?? 0)).toBe(Math.sign(pcm[i] ?? 0));
		}
	});

	it("collapses samples below the finest step to silence", () => {
		expect(pcmOf(ulawOf(1))).toBe(0);
		expect(pcmOf(ulawOf(-1))).toBe(0);
	});
});

describe("readWav", () => {
	it("round-trips 8 kHz mono PCM", () => {
		const pcm = Int16Array.from([0, 1, -1, 1000, -32768, 32767, 42]);
		const wav = encodeWav(pcm, 8000);

		expect(wav.length).toBe(44 + pcm.length * 2);

		const read = readWav(wav);

		expect(read.sampleRate).toBe(8000);
		expect(read.channels).toBe(1);
		expect(read.pcm).toEqual(pcm);
	});

	it("rejects a sample rate other than 8000", () => {
		const wav = encodeWav(Int16Array.of(1, 2, 3), 44100);

		expect(() => readWav(wav)).toThrow(/8000/);
	});

	it("rejects a buffer that is not RIFF/WAVE", () => {
		expect(() => readWav(Buffer.alloc(64))).toThrow(/RIFF/);
	});

	it("reads 32-bit float samples", () => {
		const wav = encodeFloatWav([0, 0.25, -0.25, 1, -1], 8000);
		const read = readWav(wav);

		expect(read.sampleRate).toBe(8000);
		expect(read.pcm).toEqual(Int16Array.from([0, 8192, -8192, 32767, -32767]));
	});
});

describe("rms", () => {
	it("is zero for silence", () => {
		expect(rms(new Int16Array(0))).toBe(0);
		expect(rms(new Int16Array(1000))).toBe(0);
	});

	it("is the amplitude of a constant signal", () => {
		expect(rms(new Int16Array(512).fill(32767))).toBeCloseTo(32767, 6);
		expect(rms(new Int16Array(512).fill(-8000))).toBeCloseTo(8000, 6);
	});

	it("is the amplitude of a square wave", () => {
		const pcm = new Int16Array(512);
		for (let i = 0; i < pcm.length; i++) pcm[i] = i % 2 === 0 ? 12000 : -12000;

		expect(rms(pcm)).toBeCloseTo(12000, 6);
	});
});
