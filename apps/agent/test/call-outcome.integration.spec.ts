import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	CallDirection,
	CallEventType,
	CallStatus,
	db,
	OsintStatus,
} from "@crm/db";
import recordCallOutcome from "../agent/tools/record_call_outcome";

const suffix = process.env.TEST_RUN_ID ?? `call-outcome-${process.pid}`;

let userId: string;
let contactId: string;

async function cleanup() {
	await db.callEvent.deleteMany({
		where: { call: { contactId } },
	});
	await db.call.deleteMany({ where: { contactId } });
	await db.osintTarget.deleteMany({ where: { contactId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	const user = await db.user.create({
		data: {
			id: `user-${suffix}`,
			name: "Rep One",
			email: `rep.${suffix}@example.test`,
			emailVerified: true,
		},
		select: { id: true },
	});
	userId = user.id;

	const contact = await db.contact.create({
		data: {
			firstName: "Quinn",
			email: `quinn.${suffix}@example.test`,
			phone: "+46701234567",
		},
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(cleanup);

async function liveCall() {
	return db.call.create({
		data: {
			contactId,
			userId,
			direction: CallDirection.OUTBOUND,
			status: CallStatus.IN_PROGRESS,
			calleeNumber: "+46701234567",
			startedAt: new Date(Date.now() - 60_000),
			answeredAt: new Date(Date.now() - 30_000),
		},
		select: { id: true },
	});
}

describe("record_call_outcome", () => {
	it("settles a finished call with the outcome, all 5 metrics and an end time", async () => {
		const call = await liveCall();

		const result = (await recordCallOutcome.execute(
			{
				callId: call.id,
				outcome: "INTERESTED",
				control: 0.8,
				liquidity: 0.6,
				interest: 0.9,
				decisionMaker: 0.7,
				motivation: 0.8,
				urgency: 0.5,
				experience: 0.6,
				budget: 0.7,
				summary: "Wants a follow-up next week.",
			},
			{},
		)) as { recorded: boolean; clidReadiness: number };

		expect(result.recorded).toBe(true);
		expect(result.clidReadiness).toBe(0.7);

		const row = await db.call.findUnique({ where: { id: call.id } });
		expect(row?.status).toBe(CallStatus.COMPLETED);
		expect(row?.outcome).toBe("INTERESTED");
		expect(row?.endedAt).not.toBeNull();
		expect(row?.clidControlScore).toBe(0.8);
		expect(row?.clidLiquidityScore).toBe(0.6);
		expect(row?.clidInterestScore).toBe(0.9);
		expect(row?.clidDecisionMakerScore).toBe(0.7);
		expect(row?.clidMotivationScore).toBe(0.8);
		expect(row?.clidUrgencyScore).toBe(0.5);
		expect(row?.clidExperienceScore).toBe(0.6);
		expect(row?.clidBudgetScore).toBe(0.7);
		expect(row?.summary).toBe("Wants a follow-up next week.");

		const events = await db.callEvent.findMany({
			where: { callId: call.id },
			select: { type: true },
		});
		const types = events.map((event) => event.type);
		expect(types).toContain(CallEventType.AGENT_LEAVE);
		expect(types).toContain(CallEventType.HANGUP);
	});

	it("pauses OSINT work on a wrong number", async () => {
		const call = await liveCall();

		await recordCallOutcome.execute(
			{ callId: call.id, outcome: "WRONG_NUMBER" },
			{},
		);

		const target = await db.osintTarget.findFirst({
			where: { contactId },
			orderBy: { createdAt: "desc" },
		});
		expect(target?.status).toBe(OsintStatus.SKIPPED);
		expect(target?.reason).toContain("WRONG_NUMBER");
	});

	it("rejects an unknown outcome without touching the call", async () => {
		const call = await liveCall();

		const result = (await recordCallOutcome.execute(
			{ callId: call.id, outcome: "MAYBE_LATER" },
			{},
		)) as { ok: boolean };

		expect(result.ok).toBe(false);

		const row = await db.call.findUnique({ where: { id: call.id } });
		expect(row?.status).toBe(CallStatus.IN_PROGRESS);
		expect(row?.endedAt).toBeNull();
	});
});
