import { describe, expect, it } from "bun:test";
import {
	chunksFromCollateral,
	parseMarkdownCollateral,
	toJsonlRows,
	toPitchChunks,
} from "../agent/lib/layout-ingest";
import { loadPitchCorpus } from "../agent/lib/pitch-rag";

const SAMPLE = `# Acme Widget

Best widget for busy teams.

| Plan | Price |
|---|---|
| Starter | 9 |
| Pro | 29 |

---

![Team photo](team.jpg)

Call us today.
`;

describe("layout-ingest", () => {
	it("splits pages on horizontal rules and captures tables and figures", () => {
		const doc = parseMarkdownCollateral(SAMPLE, "acme");
		expect(doc.title).toBe("Acme Widget");
		expect(doc.pages.length).toBe(2);
		const kinds = doc.pages.flatMap((p) => p.cells.map((c) => c.kind));
		expect(kinds).toContain("table");
		expect(kinds).toContain("figure");
		expect(kinds).toContain("text");
		const table = doc.pages.flatMap((p) => p.cells).find((c) => c.kind === "table")!;
		expect(table.rows).toBe(2);
		expect(table.text).toContain("Plan");
	});

	it("maps rows to pitch chunks with stable ids", () => {
		const doc = parseMarkdownCollateral(SAMPLE, "acme");
		const rows = toJsonlRows(doc);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows[0]).toMatchObject({ document: "acme", page: 1, cell: 1 });
		const chunks = toPitchChunks(doc);
		expect(chunks.length).toBe(rows.length);
		expect(chunks[0]!.id).toBe("collateral:acme#page-1-cell-1");
		expect(chunks[0]!.source).toBe("pitch");
	});

	it("returns [] for a missing collateral dir", async () => {
		await expect(chunksFromCollateral("/nonexistent-collateral-dir")).resolves.toEqual([]);
	});
});

describe("pitch-rag collateral merge", () => {
	it("adds no chunks when collateral is disabled", async () => {
		const base = await loadPitchCorpus({ collateralDir: false });
		const merged = await loadPitchCorpus({ collateralDir: "/nonexistent-collateral-dir" });
		expect(merged.length).toBe(base.length);
	});
});
