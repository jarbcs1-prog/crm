import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { SearchService } from "../src/search/search.service";

function service(
	companies: unknown[] = [],
	contacts: unknown[] = [],
	deals: unknown[] = [],
) {
	const seen: {
		companyWhere?: unknown;
		contactWhere?: unknown;
		dealWhere?: unknown;
	} = {};
	const db = {
		company: {
			findMany: async (args: { where: unknown }) => {
				seen.companyWhere = args.where;
				return companies;
			},
		},
		contact: {
			findMany: async (args: { where: unknown }) => {
				seen.contactWhere = args.where;
				return contacts;
			},
		},
		deal: {
			findMany: async (args: { where: unknown }) => {
				seen.dealWhere = args.where;
				return deals;
			},
		},
	} as unknown as Db;

	return { svc: new SearchService(db), seen };
}

describe("SearchService.quick", () => {
	it("returns empty for a short or blank query", async () => {
		const { svc } = service();
		expect((await svc.quick("")).hits).toEqual([]);
		expect((await svc.quick(" a ")).hits).toEqual([]);
	});

	it("trims the term before searching", async () => {
		const { svc, seen } = service();
		await svc.quick("  acme  ");

		expect(seen.companyWhere).toEqual({
			OR: [
				{ name: { contains: "acme", mode: "insensitive" } },
				{ domain: { contains: "acme", mode: "insensitive" } },
			],
		});
	});

	it("maps hits with label and detail", async () => {
		const { svc } = service(
			[
				{
					id: "co_1",
					name: "Acme",
					domain: "acme.com",
					iconUrl: null,
					iconDarkUrl: null,
					iconTone: null,
				},
			],
			[
				{
					id: "c_1",
					firstName: "Ada",
					lastName: "Lovelace",
					email: "ada@acme.com",
					imageUrl: null,
					company: { name: "Acme" },
				},
			],
			[
				{
					id: "d_1",
					name: "Acme deal",
					company: {
						name: "Acme",
						iconUrl: null,
						iconDarkUrl: null,
						iconTone: null,
					},
				},
			],
		);

		const { hits } = await svc.quick("acme");

		expect(hits.map((h) => h.kind)).toEqual(["company", "contact", "deal"]);
		expect(hits[1]?.label).toBe("Ada Lovelace");
		expect(hits[1]?.detail).toBe("Acme");
		expect(hits[2]?.label).toBe("Acme deal");
	});
});
