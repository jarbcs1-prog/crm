import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { findSwedishContacts } from "../agent/tools/find_swedish_contacts";

async function clear(): Promise<void> {
	await db.contact.deleteMany({});
}

beforeEach(clear);
afterEach(clear);

async function swedish(firstName: string): Promise<{ id: string }> {
	return db.contact.create({
		data: {
			firstName,
			lastName: "Lead",
			email: `swedish-${crypto.randomUUID()}@example.test`,
			phone: "+46701946961",
			country: "Sweden",
			lastActivityAt: new Date(),
		},
		select: { id: true },
	});
}

async function norwegian(): Promise<{ id: string }> {
	return db.contact.create({
		data: {
			firstName: "Norwegian",
			lastName: "Lead",
			email: `norwegian-${crypto.randomUUID()}@example.test`,
			phone: "+4712345678",
			country: "Norway",
			lastActivityAt: new Date(),
		},
		select: { id: true },
	});
}

describe("find_swedish_contacts", () => {
	it("returns only contacts from Sweden", async () => {
		const s = await swedish("A");
		await norwegian();

		const result = await findSwedishContacts({ limit: 1000 });
		const ids = result.contacts.map((c: { id: string }) => c.id);

		expect(ids).toContain(s.id);
		expect(
			result.contacts.every((c: { country: string }) => c.country === "Sweden"),
		).toBe(true);
	});

	it("excludes contacts without a phone when requirePhone is true", async () => {
		const withPhone = await swedish("B");
		const withoutPhone = await db.contact.create({
			data: {
				firstName: "NoPhone",
				lastName: "Lead",
				email: `nophone-${crypto.randomUUID()}@example.test`,
				phone: null,
				country: "Sweden",
				lastActivityAt: new Date(),
			},
			select: { id: true },
		});

		const result = await findSwedishContacts({
			limit: 1000,
			requirePhone: true,
		});
		const ids = result.contacts.map((c: { id: string }) => c.id);

		expect(ids).toContain(withPhone.id);
		expect(ids).not.toContain(withoutPhone.id);
	});

	it("includes contacts without a phone when requirePhone is false", async () => {
		const withPhone = await swedish("C");
		const withoutPhone = await db.contact.create({
			data: {
				firstName: "NoPhone",
				lastName: "Lead",
				email: `nophone2-${crypto.randomUUID()}@example.test`,
				phone: null,
				country: "Sweden",
				lastActivityAt: new Date(),
			},
			select: { id: true },
		});

		const result = await findSwedishContacts({
			limit: 1000,
			requirePhone: false,
		});
		const ids = result.contacts.map((c: { id: string }) => c.id);

		expect(ids).toContain(withPhone.id);
		expect(ids).toContain(withoutPhone.id);
	});

	it("respects the limit", async () => {
		await swedish("D");
		await swedish("E");
		await swedish("F");

		const result = await findSwedishContacts({ limit: 2 });
		expect(result.contacts).toHaveLength(2);
	});

	it("returns an empty array when there are no Swedish contacts", async () => {
		await norwegian();

		const result = await findSwedishContacts({ limit: 1000 });
		expect(result.contacts).toHaveLength(0);
	});

	it("defaults the limit to 20", async () => {
		for (let i = 0; i < 25; i++) await swedish(`S${i}`);

		const result = await findSwedishContacts({});
		expect(result.count).toBeLessThanOrEqual(20);
	});
});
