import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	capabilities,
	capabilitiesMarkdown,
	enabled,
	unavailable,
} from "../agent/lib/capabilities";

const KEYS = [
	"RAPIDAPI_KEY",
	"TAVILY_API_KEY",
	"EXA_API_KEY",
	"BRAVE_API_KEY",
	"FIRECRAWL_API_KEY",
	"GOOGLE_API_KEY",
	"GOOGLE_CSE_ID",
	"CONTEXT_DEV_API_KEY",
	"BLOB_READ_WRITE_TOKEN",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("capabilities", () => {
	it("reports everything off on a bare install", () => {
		expect(capabilities().every((c) => !c.enabled)).toBe(true);
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("turns one on without turning on the others", () => {
		process.env.TAVILY_API_KEY = "tavily-test";

		expect(enabled("TAVILY_API_KEY")).toBe(true);
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("treats blank and whitespace as unset", () => {
		process.env.RAPIDAPI_KEY = "   ";
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("is read live, so a late-configured process is not stuck off", () => {
		expect(enabled("RAPIDAPI_KEY")).toBe(false);
		process.env.RAPIDAPI_KEY = "key";
		expect(enabled("RAPIDAPI_KEY")).toBe(true);
	});

	it("is unknown for a variable that is not a capability", () => {
		process.env.SOMETHING_ELSE = "x";
		expect(enabled("SOMETHING_ELSE")).toBe(false);
		delete process.env.SOMETHING_ELSE;
	});
});

describe("the unavailable result", () => {
	it("says retrying will not help", () => {
		const result = unavailable("RAPIDAPI_KEY");

		expect(result.ok).toBe(false);
		expect(result.configured).toBe(false);
		expect(result.reason).toContain("retrying will not help");
		expect(result.reason).toContain("RAPIDAPI_KEY");
	});
});

describe("the capability briefing", () => {
	it("tells a bare install to work from the CRM alone", () => {
		const markdown = capabilitiesMarkdown();

		expect(markdown).toContain("No outside sources are configured");
		expect(markdown).toContain("read_crm_history");
	});

	it("lists what is on and what is off, separately", () => {
		process.env.RAPIDAPI_KEY = "key";
		process.env.TAVILY_API_KEY = "key";
		const markdown = capabilitiesMarkdown();

		expect(markdown).toContain("Available:");
		expect(markdown).toContain("LinkedIn");
		expect(markdown).toContain("Not configured here");
		expect(markdown).toContain("Web research");
	});

	it("does not warn about missing sources when everything is on", () => {
		for (const key of KEYS) process.env[key] = "key";

		expect(capabilitiesMarkdown()).not.toContain("Not configured here");
	});
});
