import {
	CallEventType,
	CallOutcome,
	CallStatus,
	db,
	OsintStatus,
} from "@crm/db";
import { z } from "zod";
import { writeTimelineNote } from "../lib/crm";
import { isTerminalStatus } from "../lib/voice";
import { defineTool } from "../lib/tool-factory";

const OUTCOME_PORT: Record<string, CallOutcome> = {
	...(Object.fromEntries(
		Object.values(CallOutcome).map((value) => [value, value]),
	) as Record<string, CallOutcome>),
	appointment_scheduled: CallOutcome.MEETING_BOOKED,
	callback_requested: CallOutcome.FOLLOW_UP,
	not_interested: CallOutcome.NOT_INTERESTED,
	qualified: CallOutcome.INTERESTED,
	qualified_with_concerns: CallOutcome.FOLLOW_UP,
	not_viable: CallOutcome.DO_NOT_CALL,
	no_answer: CallOutcome.NO_ANSWER,
};

export default defineTool({
	description:
		"Records what happened on a call: the outcome, optional qualification scores between 0 and 1 and a short summary. Wrong numbers and do-not-call results also pause OSINT work for that contact.",
	inputSchema: z.object({
		callId: z.string().min(1).describe("The CRM id of the call."),
		outcome: z
			.string()
			.min(1)
			.describe(
				"The call outcome; accepts CRM outcomes and legacy slugs such as appointment_scheduled.",
			),
		control: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe("CLID control score, 0-1."),
		liquidity: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe("CLID liquidity score, 0-1."),
		interest: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe("CLID interest score, 0-1."),
		decisionMaker: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe("CLID decision-maker score, 0-1."),
		summary: z
			.string()
			.optional()
			.describe("A short honest note about what happened on the call."),
	}),
	async execute({
		callId,
		outcome,
		control,
		liquidity,
		interest,
		decisionMaker,
		summary,
	}) {
		const call = await db.call.findUnique({
			where: { id: callId },
			select: {
				id: true,
				contactId: true,
				status: true,
				startedAt: true,
				answeredAt: true,
				endedAt: true,
			},
		});
		if (!call) return { ok: false as const, reason: "No such call." };

		const mappedOutcome = OUTCOME_PORT[outcome];
		if (!mappedOutcome)
			return { ok: false as const, reason: `Unknown outcome "${outcome}".` };

		const clidScores = [control, liquidity, interest, decisionMaker].filter(
			(value): value is number => typeof value === "number",
		);
		const clidReadiness =
			clidScores.length > 0
				? Math.round(
						(clidScores.reduce((sum, value) => sum + value, 0) /
							clidScores.length) *
							100,
					) / 100
				: null;

		const wasTerminal = call.endedAt !== null || isTerminalStatus(call.status);
		const anchor = call.answeredAt ?? call.startedAt;
		const now = new Date();
		const durationSecs = anchor
			? Math.max(0, Math.round((now.getTime() - anchor.getTime()) / 1000))
			: null;

		await db.call.update({
			where: { id: call.id },
			data: {
				status: CallStatus.COMPLETED,
				outcome: mappedOutcome,
				endedAt: call.endedAt ?? now,
				durationSecs: call.endedAt ? undefined : durationSecs,
				...(control === undefined ? {} : { clidControlScore: control }),
				...(liquidity === undefined ? {} : { clidLiquidityScore: liquidity }),
				...(interest === undefined ? {} : { clidInterestScore: interest }),
				...(decisionMaker === undefined
					? {}
					: { clidDecisionMakerScore: decisionMaker }),
				...((summary ?? undefined) === undefined ? {} : { summary }),
			},
		});

		await db.callEvent.create({
			data: {
				callId: call.id,
				type: CallEventType.AGENT_LEAVE,
				payload: { outcome: mappedOutcome },
			},
		});
		if (!wasTerminal) {
			await db.callEvent.create({
				data: { callId: call.id, type: CallEventType.HANGUP },
			});
		}

		if (call.contactId) {
			await writeTimelineNote(
				call.contactId,
				"Call outcome recorded",
				`Outcome recorded for the call: ${mappedOutcome}${clidReadiness !== null ? ` (CLID readiness ${clidReadiness})` : ""}.`,
				{ callId: call.id, outcome: mappedOutcome, clidReadiness },
			);
		}

		if (
			call.contactId &&
			(mappedOutcome === CallOutcome.WRONG_NUMBER ||
				mappedOutcome === CallOutcome.DO_NOT_CALL)
		) {
			const existing = await db.osintTarget.findFirst({
				where: {
					contactId: call.contactId,
					status: { in: [OsintStatus.PENDING, OsintStatus.IN_PROGRESS] },
				},
				select: { id: true },
			});
			const reason = `Call outcome ${mappedOutcome}`;
			if (existing) {
				await db.osintTarget.update({
					where: { id: existing.id },
					data: { status: OsintStatus.SKIPPED, reason, error: null },
				});
			} else {
				await db.osintTarget.create({
					data: {
						contactId: call.contactId,
						status: OsintStatus.SKIPPED,
						priority: 0,
						reason,
					},
				});
			}
		}

		return { recorded: true as const, outcome: mappedOutcome, clidReadiness };
	},
});
