import { describe, expect, it } from "bun:test";
import { ActivityType, DealStage } from "@crm/db";
import type { Db } from "@crm/db";
import { DealsService } from "../src/deals/deals.service";

function service(overrides: {
	findUnique?: unknown;
	transaction?: unknown;
}) {
	const seen: { update?: unknown; activity?: unknown; touched?: unknown } = {};

	const db = {
		deal: {
			findUnique: overrides.findUnique as never,
			update: (args: unknown) => {
				seen.update = args;
				return Promise.resolve({ id: "deal_1", stage: (args as { data: { stage: unknown } }).data.stage });
			},
		},
		activity: {
			create: (args: unknown) => {
				seen.activity = args;
				return Promise.resolve({ id: "act_1" });
			},
		},
		$transaction: async (ops: unknown[]) => {
			if (overrides.transaction) return overrides.transaction as never;
			const results: unknown[] = [];
			for (const op of ops) results.push(await (op as Promise<unknown>));
			return results;
		},
	} as unknown as Db;

	const stamp = {
		touch: async (keys: unknown, date: unknown) => {
			seen.touched = { keys, date };
		},
	} as unknown as import("../src/crm/activity-stamp.service").ActivityStampService;

	return {
		svc: new DealsService(db, stamp),
		seen,
	};
}

describe("DealsService.setStage", () => {
	it("is a no-op when the stage is already the same", async () => {
		const { svc } = service({
			findUnique: async () => ({ id: "deal_1", stage: DealStage.DEMO_BOOKED, companyId: "co_1" }),
		});

		const result = await svc.setStage({ id: "deal_1", stage: DealStage.DEMO_BOOKED }, "user_1");

		expect(result.changed).toBe(false);
	});

	it("requires a reason when losing a deal", async () => {
		const { svc } = service({
			findUnique: async () => ({ id: "deal_1", stage: DealStage.DEMO_BOOKED, companyId: "co_1" }),
		});

		expect(svc.setStage({ id: "deal_1", stage: DealStage.CLOSED_LOST }, "user_1")).rejects.toThrow();
	});

	it("sets stageChangedAt and closedAt for a closed stage", async () => {
		const { svc, seen } = service({
			findUnique: async () => ({ id: "deal_1", stage: DealStage.DEMO_BOOKED, companyId: "co_1" }),
		});

		await svc.setStage({ id: "deal_1", stage: DealStage.CLOSED_WON }, "user_1");

		const data = (seen.update as { data: Record<string, unknown> }).data;
		expect(data.stage).toBe(DealStage.CLOSED_WON);
		expect(data.stageChangedAt).toBeInstanceOf(Date);
		expect(data.closedAt).toBeInstanceOf(Date);
	});

	it("clears closedAt when reopening a deal", async () => {
		const { svc, seen } = service({
			findUnique: async () => ({ id: "deal_1", stage: DealStage.CLOSED_WON, companyId: "co_1" }),
		});

		await svc.setStage({ id: "deal_1", stage: DealStage.DEMO_BOOKED }, "user_1");

		const data = (seen.update as { data: Record<string, unknown> }).data;
		expect(data.closedAt).toBeNull();
		expect(data.closedReason).toBeNull();
	});

	it("logs a stage-change activity with from and to", async () => {
		const { svc, seen } = service({
			findUnique: async () => ({ id: "deal_1", stage: DealStage.DEMO_BOOKED, companyId: "co_1" }),
		});

		await svc.setStage({ id: "deal_1", stage: DealStage.CONTRACT_SENT }, "user_1");

		const data = (seen.activity as { data: Record<string, unknown> }).data;
		expect(data.type).toBe(ActivityType.STAGE_CHANGE);
		expect(data.meta).toEqual({ from: DealStage.DEMO_BOOKED, to: DealStage.CONTRACT_SENT });
		expect(data.createdById).toBe("user_1");
	});

	it("touches the activity stamp for the deal and company", async () => {
		const { svc, seen } = service({
			findUnique: async () => ({ id: "deal_1", stage: DealStage.DEMO_BOOKED, companyId: "co_1" }),
		});

		await svc.setStage({ id: "deal_1", stage: DealStage.CONTRACT_SENT }, "user_1");

		expect((seen.touched as { keys: unknown }).keys).toEqual({ companyId: "co_1", dealId: "deal_1" });
	});
});
