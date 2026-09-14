import { describe, expect, it } from "bun:test";
import { guardThirdPartyQuery, looksLikeMessageContent } from "../agent/lib/egress-guard";

describe("egress guard", () => {
	it("allows a derived public question", () => {
		expect(guardThirdPartyQuery("What has Acme announced in 2026?").ok).toBe(true);
	});

	it("allows a name and email (derived query, not message text)", () => {
		expect(
			guardThirdPartyQuery("Research Jane Doe at jane@acme.com, VP Sales").ok,
		).toBe(true);
	});

	it("refuses a forwarded message block", () => {
		const q = [
			"-----Original Message-----",
			"From: bob@vendor.com",
			"To: us@acme.com",
			"Subject: Q3 numbers",
			"",
			"Here are the real figures for the quarter...",
		].join("\n");

		expect(guardThirdPartyQuery(q).ok).toBe(false);
		expect(looksLikeMessageContent(q)).toBe(true);
	});

	it("refuses two email-header lines", () => {
		const q = "From: a@b.com\nTo: c@d.com\nwhat should we do about this?";
		expect(guardThirdPartyQuery(q).ok).toBe(false);
	});

	it("refuses a quoted reply block", () => {
		const q = "> I think we should ship it\n> The client agreed on the call\n> Let me know if you disagree";
		expect(guardThirdPartyQuery(q).ok).toBe(false);
	});

	it("refuses an 'On ... wrote:' attribution", () => {
		const q = "On Mon, Sep 14, 2026, Jane Doe wrote:\nCan you send the contract?";
		expect(guardThirdPartyQuery(q).ok).toBe(false);
	});

	it("returns a helpful reason on refusal", () => {
		const result = guardThirdPartyQuery("From: x@y.com\nTo: z@w.com\nhi");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain("third party");
	});
});
