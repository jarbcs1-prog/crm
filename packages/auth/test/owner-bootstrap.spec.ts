// @ts-nocheck
import { ownerEmails } from "../src/workspace";

describe("ownerEmails", () => {
	afterEach(() => {
		delete process.env.OWNER_EMAILS;
	});

	it("parses a single owner", () => {
		process.env.OWNER_EMAILS = "you@acme.com";
		expect(ownerEmails().has("you@acme.com")).toBe(true);
		expect(ownerEmails().size).toBe(1);
	});

	it("parses multiple owners case-insensitive", () => {
		process.env.OWNER_EMAILS = " You@Acme.com , ops@ACME.com ";
		expect(ownerEmails().has("you@acme.com")).toBe(true);
		expect(ownerEmails().has("ops@acme.com")).toBe(true);
	});

	it("returns empty when unset", () => {
		delete process.env.OWNER_EMAILS;
		expect(ownerEmails().size).toBe(0);
	});
});
