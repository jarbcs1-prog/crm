import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { ActivityStampService } from "../src/crm/activity-stamp.service";

function service() {
	const seen: { company?: unknown; contact?: unknown; deal?: unknown } = {};
	const db = {
		company: {
			updateMany: async (args: unknown) => {
				seen.company = args;
			},
		},
		contact: {
			updateMany: async (args: unknown) => {
				seen.contact = args;
			},
		},
		deal: {
			updateMany: async (args: unknown) => {
				seen.deal = args;
			},
		},
	} as unknown as Db;

	return { svc: new ActivityStampService(db), seen };
}

describe("ActivityStampService.touch", () => {
	it("only touches the targeted kind and uses staleness guard", async () => {
		const { svc, seen } = service();
		const at = new Date("2026-09-14T00:00:00Z");

		await svc.touch({ companyId: "co_1" }, at);

		expect(seen.company).toEqual({
			where: {
				id: "co_1",
				OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }],
			},
			data: { lastActivityAt: at },
		});
		expect(seen.contact).toBeUndefined();
		expect(seen.deal).toBeUndefined();
	});

	it("touches all three when all ids are present", async () => {
		const { svc, seen } = service();
		const at = new Date();

		await svc.touch({ companyId: "co_1", contactId: "c_1", dealId: "d_1" }, at);

		expect(seen.company).toBeDefined();
		expect(seen.contact).toBeDefined();
		expect(seen.deal).toBeDefined();
	});
});
