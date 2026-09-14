import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { DealStage } from "@crm/db";
import { DashboardService } from "../src/dashboard/dashboard.service";

function dec(dollars: number) {
	return {
		times: (f: number) => ({ toNumber: () => dollars * f }),
	} as unknown as never;
}

function dashboardDb(overrides: Partial<Record<string, unknown>> = {}) {
	const openByStage = [
		{ stage: DealStage.DEMO_BOOKED, _count: { _all: 2 }, _sum: { amount: dec(100) } },
		{ stage: DealStage.CONTRACT_SENT, _count: { _all: 1 }, _sum: { amount: dec(200) } },
	];
	const now = new Date();
	const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
	const wonDeal = {
		amount: dec(500),
		stage: DealStage.CLOSED_WON,
		createdAt: new Date(trendStart.getTime() + 5 * 24 * 60 * 60 * 1000),
		closedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
	};
	const lostDeal = {
		amount: dec(300),
		stage: DealStage.CLOSED_LOST,
		createdAt: new Date(trendStart.getTime() + 10 * 24 * 60 * 60 * 1000),
		closedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
	};
	const recentDeals = [wonDeal, lostDeal];

	const db = {
		deal: {
			groupBy: async () => openByStage,
			findMany: async (args: { where?: unknown; orderBy?: unknown; take?: number }) => {
				if (args.take === 6) return [];
				return recentDeals;
			},
			aggregate: async () => ({ _count: { _all: 1 }, _sum: { amount: dec(50) } }),
		},
		activity: {
			findMany: async () => [],
		},
	} as unknown as Db;

	for (const [k, v] of Object.entries(overrides)) {
		(db.deal as unknown as Record<string, unknown>)[k] = v;
		(db.activity as unknown as Record<string, unknown>)[k] = v;
	}

	return { db, openByStage, recentDeals };
}

describe("DashboardService KPI math", () => {
	it("sums pipeline stages and totals", async () => {
		const { db } = dashboardDb();
		const svc = new DashboardService(db);

		const result = await svc.summary("user_1", { scope: "everyone" });

		expect(result.pipeline.totalDeals).toBe(3);
		expect(result.pipeline.totalCents).toBe(30000);
		expect(result.pipeline.stages.find((s: { stage: DealStage }) => s.stage === DealStage.DEMO_BOOKED)?.count).toBe(2);
	});

	it("computes win rate and averages over 90-day window", async () => {
		const { db } = dashboardDb();
		const svc = new DashboardService(db);

		const result = await svc.summary("user_1", { scope: "everyone" });

		expect(result.performance.wins).toBe(1);
		expect(result.performance.losses).toBe(1);
		expect(result.performance.winRate).toBe(0.5);
		expect(result.performance.avgDealCents).toBe(50000);
		expect(typeof result.performance.avgCycleDays).toBe("number");
	});

	it("returns null when there are no wins", async () => {
		const db = {
			deal: {
				groupBy: async () => [],
				findMany: async () => [],
				aggregate: async () => ({ _count: { _all: 0 }, _sum: { amount: null } }),
			},
			activity: { findMany: async () => [] },
		} as unknown as Db;

		const svc = new DashboardService(db);
		const result = await svc.summary("user_1", { scope: "everyone" });

		expect(result.performance.winRate).toBeNull();
		expect(result.performance.avgDealCents).toBeNull();
		expect(result.performance.avgCycleDays).toBeNull();
	});

	it("scopes open pipeline to the acting user when scope is me", async () => {
		let captured: unknown;
		const db = {
			deal: {
				groupBy: async (args: { where: unknown }) => {
					captured = args.where;
					return [];
				},
				findMany: async () => [],
				aggregate: async () => ({ _count: { _all: 0 }, _sum: { amount: null } }),
			},
			activity: { findMany: async () => [] },
		} as unknown as Db;

		const svc = new DashboardService(db);
		await svc.summary("user_42", { scope: "me" });

		expect(captured).toEqual(expect.objectContaining({ ownerId: "user_42" }));
	});
});
