import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { CallDirection, CallStatus, db } from "@crm/db";
import { readCrmHistory } from "../agent/lib/crm";

const suffix = process.env.TEST_RUN_ID ?? `call-analytics-${process.pid}`;

let userId: string;
let contactId: string;

async function cleanup() {
	await db.call.deleteMany({ where: { contactId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	const user = await db.user.create({
		data: {
			id: `user-${suffix}`,
			name: "Rep Two",
			email: `rep2.${suffix}@example.test`,
			emailVerified: true,
		},
		select: { id: true },
	});
	userId = user.id;

	const contact = await db.contact.create({
		data: {
			firstName: "Riley",
			email: `riley.${suffix}@example.test`,
			phone: "+46707654321",
		},
		select: { id: true },
	});
	contactId = contact.id;

	await db.call.create({
		data: {
			contactId,
			userId,
			direction: CallDirection.OUTBOUND,
			status: CallStatus.COMPLETED,
			outcome: "INTERESTED",
			calleeNumber: "+46707654321",
			startedAt: new Date(Date.now() - 300_000),
			answeredAt: new Date(Date.now() - 280_000),
			endedAt: new Date(Date.now() - 100_000),
			durationSecs: 180,
			summary: "Interested, follow up.",
			clidInterestScore: 0.9,
			clidBudgetScore: 0.7,
		},
	});
	await db.call.create({
		data: {
			contactId,
			userId,
			direction: CallDirection.OUTBOUND,
			status: CallStatus.NO_ANSWER,
			outcome: "NO_ANSWER",
			calleeNumber: "+46707654321",
			startedAt: new Date(Date.now() - 60_000),
		},
	});
});

afterAll(cleanup);

describe("call analytics in read_crm_history", () => {
	it("returns recent calls with ids, scores and aggregate analytics", async () => {
		const history = await readCrmHistory(contactId);
		expect(history).not.toBeNull();
		if (!history) return;

		expect(history.calls.length).toBe(2);
		const finished = history.calls.find(
			(call) => call.outcome === "INTERESTED",
		);
		expect(finished?.durationSecs).toBe(180);
		expect(finished?.summary).toBe("Interested, follow up.");
		expect(finished?.scores.interest).toBe(0.9);
		expect(finished?.scores.budget).toBe(0.7);
		expect(finished?.scores.motivation).toBeNull();
		expect(typeof finished?.id).toBe("string");

		expect(history.callAnalytics.totalCalls).toBe(2);
		expect(history.callAnalytics.connected).toBe(1);
		expect(history.callAnalytics.outcomes).toEqual({
			INTERESTED: 1,
			NO_ANSWER: 1,
		});
		expect(history.callAnalytics.avgScores.interest).toBe(0.9);
		expect(history.callAnalytics.avgScores.motivation).toBeNull();
	});
});
