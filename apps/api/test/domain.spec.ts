import { describe, expect, it } from "bun:test";
import { domainFromEmail, normalizeDomain } from "../src/companies/domain";

describe("normalizeDomain", () => {
	it("reduces anything a human might type to the bare host", () => {
		for (const input of [
			"stripe.com",
			"STRIPE.com",
			"  stripe.com  ",
			"www.stripe.com",
			"https://stripe.com",
			"https://www.Stripe.com/pricing?ref=x",
			"http://stripe.com/",
		]) {
			expect(normalizeDomain(input)).toBe("stripe.com");
		}
	});

	it("rejects things that are not hostnames", () => {
		for (const input of [
			"",
			"   ",
			"localhost",
			"my company",
			"not a domain",
		]) {
			expect(normalizeDomain(input)).toBeNull();
		}
		expect(normalizeDomain(null)).toBeNull();
		expect(normalizeDomain(undefined)).toBeNull();
	});
});

describe("domainFromEmail", () => {
	it("takes the domain off a work address", () => {
		expect(domainFromEmail("ada@stripe.com")).toBe("stripe.com");
		expect(domainFromEmail("  Ada@WWW.Stripe.com ")).toBe("stripe.com");
	});

	it("ignores free and malformed addresses", () => {
		for (const email of [
			"ada@gmail.com",
			"ada@outlook.com",
			"ada@proton.me",
			"@stripe.com",
			"not-an-email",
			"",
		]) {
			expect(domainFromEmail(email)).toBeNull();
		}
	});
});
