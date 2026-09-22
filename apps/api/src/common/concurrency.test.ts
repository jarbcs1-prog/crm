import { describe, expect, it } from "vitest";
import { runLimited } from "./concurrency";

describe("runLimited", () => {
	it("limits concurrency", async () => {
		let concurrent = 0,
			max = 0;
		await runLimited([1, 2, 3, 4, 5], 2, async () => {
			concurrent++;
			max = Math.max(max, concurrent);
			await new Promise((r) => setTimeout(r, 10));
			concurrent--;
		});
		expect(max).toBe(2);
	});
	it("preserves order", async () => {
		const out = await runLimited([1, 2, 3], 2, async (n) => n * 2);
		expect(out).toEqual([2, 4, 6]);
	});
});
