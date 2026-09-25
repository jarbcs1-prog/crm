import { describe, expect, it } from "bun:test";
import scheduleCalls, {
	SCHEDULE_BATCH_CAP,
} from "../agent/tools/schedule_calls";

describe("schedule_calls batch cap", () => {
	it("caps a batch at 60 and reports what was left out", async () => {
		const contactIds = Array.from(
			{ length: SCHEDULE_BATCH_CAP + 5 },
			(_, index) => `no-such-contact-${process.pid}-${index}`,
		);
		const result = (await scheduleCalls.execute({ contactIds }, {})) as {
			scheduled: number;
			kind: string;
			capped?: boolean;
			skipped?: number;
			results: { contactId: string }[];
		};

		expect(SCHEDULE_BATCH_CAP).toBe(60);
		expect(result.results.length).toBe(60);
		expect(result.capped).toBe(true);
		expect(result.skipped).toBe(5);
		expect(result.kind).toBe("call");
	});

	it("queues a bulk batch as voice-batch kind", async () => {
		const result = (await scheduleCalls.execute(
			{ contactIds: [`no-such-contact-${process.pid}-bulk`], bulk: true },
			{},
		)) as { kind: string; capped?: boolean };

		expect(result.kind).toBe("voice-batch");
		expect(result.capped).toBeUndefined();
	});
});
