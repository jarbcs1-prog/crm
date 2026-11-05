import { describe, expect, it } from "bun:test";

import { isValidE164, normalizeToE164 } from "../agent/lib/phone";

describe("normalizeToE164", () => {
	it("passes through a clean E.164 number", () => {
		expect(normalizeToE164("+14155552671")).toBe("+14155552671");
	});

	it("strips common separators", () => {
		expect(normalizeToE164("+1 (415) 555-2671")).toBe("+14155552671");
		expect(normalizeToE164("+46.8.123.4567")).toBe("+4681234567");
	});

	it("converts a 00 international prefix to +", () => {
		expect(normalizeToE164("0041415552671")).toBe("+41415552671");
	});

	it("rejects numbers without an international prefix", () => {
		expect(normalizeToE164("4155552671")).toBeNull();
		expect(normalizeToE164("(415) 555-2671")).toBeNull();
	});

	it("rejects letters and extensions instead of silently changing the number", () => {
		expect(normalizeToE164("+1-415-ABC-2671")).toBeNull();
		expect(normalizeToE164("+1-415-555-2671 ext. 42")).toBeNull();
	});

	it("rejects too-short, empty, and non-numeric input", () => {
		expect(normalizeToE164("+123456")).toBeNull();
		expect(normalizeToE164("")).toBeNull();
		expect(normalizeToE164(null)).toBeNull();
		expect(normalizeToE164(undefined)).toBeNull();
		expect(normalizeToE164("+1-ABC-DEF")).toBeNull();
	});
});

describe("isValidE164", () => {
	it("accepts clean E.164 and rejects the rest", () => {
		expect(isValidE164("+14155552671")).toBe(true);
		expect(isValidE164("+1 (415) 555-2671")).toBe(false);
		expect(isValidE164(normalizeToE164("+1 (415) 555-2671") ?? "")).toBe(true);
		expect(isValidE164("4155552671")).toBe(false);
		expect(isValidE164("not a number")).toBe(false);
	});
});
