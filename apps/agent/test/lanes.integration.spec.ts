import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { DIRECT_KINDS, isDirectKind, PRIORITY } from "@crm/db/agent-tasks";
import { claimDue } from "../agent/lib/tasks";

const REASON = `lane-test-${process.pid}`;

const VISIBLE = { only: DIRECT_KINDS } as const;
const RESEARCH = { except: DIRECT_KINDS } as const;

async function clear() {
	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ reason: { startsWith: "lane-test" } },
				{ kind: { startsWith: "test-lease" } },
				{ reason: "test" },
			],
		},
	});
}

beforeEach(clear);
afterEach(clear);

async function queue(kind: string, priority: number) {
	return db.agentTask.create({
		data: {
			kind,
			reason: REASON,
			dueAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
			priority,
			budget: 2,
		},
		select: { id: true },
	});
}

describe("dispatch lanes", () => {
	it("keeps a logo out of the research lane and a brief out of the visible one", async () => {
		const brand = await queue("brand", PRIORITY.brand);
		const profile = await queue("company-profile", PRIORITY.workspace);

		const visible = await claimDue(500, VISIBLE);
		const research = await claimDue(500, RESEARCH);

		const visibleIds = visible.map((t) => t.id);
		expect(visibleIds).not.toContain(profile.id);
		expect(visibleIds).not.toContain(profile.id);
		expect(research.map((t) => t.id)).not.toContain(brand.id);

		const brandRow = await db.agentTask.findUnique({ where: { id: brand.id } });
		const profileRow = await db.agentTask.findUnique({ where: { id: profile.id } });
		expect(brandRow?.leasedUntil).not.toBeNull();
		expect(profileRow?.leasedUntil).not.toBeNull();
	});

	it("a logo is never starved by a queue full of research", async () => {
		for (let i = 0; i < 30; i += 1) {
			await queue("identify", PRIORITY.identify);
		}

		const brand = await queue("brand", PRIORITY.brand);

		const visible = await claimDue(5, VISIBLE);

		expect(visible.map((t) => t.id)).toContain(brand.id);
	});

	it("takes the visible work in priority order", async () => {
		const portrait = await queue("portrait", PRIORITY.portrait);
		const brand = await queue("brand", PRIORITY.brand);

		const claimed = await claimDue(10, VISIBLE);
		const ordered = claimed
			.filter((t) => t.id === brand.id || t.id === portrait.id)
			.map((t) => t.id);

		expect(ordered).toEqual([brand.id, portrait.id]);
	});

	it("sends the who-are-we pass to the research lane, ahead of the contacts", async () => {
		const identify = await queue("identify", PRIORITY.identify);
		const us = await queue("workspace-profile", PRIORITY.workspace);

		const visible = await claimDue(10, VISIBLE);
		const research = await claimDue(10, RESEARCH);

		expect(visible.map((t) => t.id)).not.toContain(us.id);

		const ordered = research
			.filter((t) => t.id === us.id || t.id === identify.id)
			.map((t) => t.id);

		expect(ordered).toEqual([us.id, identify.id]);
	});

	it("leases the two lanes independently", async () => {
		const brand = await queue("brand", PRIORITY.brand);

		await claimDue(10, VISIBLE);
		const again = await claimDue(10, RESEARCH);

		expect(again.map((t) => t.id)).not.toContain(brand.id);
	});

	it("a bulk call batch never delays a logo and never enters the visible lane", async () => {
		const batch: { id: string }[] = [];
		for (let i = 0; i < 30; i += 1) {
			batch.push(await queue("voice-batch", PRIORITY.voiceBatch));
		}

		const brand = await queue("brand", PRIORITY.brand);

		const visible = await claimDue(5, VISIBLE);
		expect(visible.map((t) => t.id)).toContain(brand.id);
		expect(
			visible.map((t) => t.id).some((id) => batch.some((b) => b.id === id)),
		).toBe(false);

		const research = await claimDue(40, RESEARCH);
		expect(
			research.map((t) => t.id).filter((id) => batch.some((b) => b.id === id))
				.length,
		).toBe(30);
	});
});

describe("kind vocabulary", () => {
	it("agrees on which kinds skip the model", () => {
		expect(isDirectKind("brand")).toBe(true);
		expect(isDirectKind("portrait")).toBe(true);
		expect(isDirectKind("company-profile")).toBe(false);
		expect(isDirectKind("identify")).toBe(false);
		expect(isDirectKind("voice-batch")).toBe(false);
		expect(isDirectKind("workspace-profile")).toBe(false);
	});

	it("puts what a rep sees first above what they have to click for", () => {
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.requested);
		expect(PRIORITY.portrait).toBeGreaterThan(PRIORITY.requested);
		expect(PRIORITY.requested).toBeGreaterThan(PRIORITY.voiceBatch);
		expect(PRIORITY.voiceBatch).toBeGreaterThan(PRIORITY.call);
		expect(PRIORITY.requested).toBeGreaterThan(PRIORITY.companyProfile);
		expect(PRIORITY.companyProfile).toBeGreaterThan(PRIORITY.recheck);
	});
});
