import { CallEventType, CallStatus, Prisma, db } from "@crm/db";
import { timingSafeEqual } from "node:crypto";
import { defineChannel, POST } from "eve/channels";
import { callCode, isTerminalStatus } from "../lib/voice";

type VoiceEvent =
	| "RING"
	| "ANSWER"
	| "VOICEMAIL"
	| "TRANSFER"
	| "RECORDING_START"
	| "HANGUP"
	| "SIP_ERROR"
	| "NO_ANSWER"
	| "BUSY"
	| "CANCELLED";

const EVENT_TOKEN: Record<string, VoiceEvent> = {
	ring: "RING",
	ringing: "RING",
	live: "ANSWER",
	inprogress: "ANSWER",
	started: "ANSWER",
	callstarted: "ANSWER",
	answer: "ANSWER",
	answered: "ANSWER",
	connected: "ANSWER",
	voicemail: "VOICEMAIL",
	transfer: "TRANSFER",
	transferred: "TRANSFER",
	record: "RECORDING_START",
	recording: "RECORDING_START",
	recordingstart: "RECORDING_START",
	fail: "SIP_ERROR",
	failed: "SIP_ERROR",
	error: "SIP_ERROR",
	siperror: "SIP_ERROR",
	noanswer: "NO_ANSWER",
	busy: "BUSY",
	cancel: "CANCELLED",
	cancelled: "CANCELLED",
	canceled: "CANCELLED",
	end: "HANGUP",
	ended: "HANGUP",
	hangup: "HANGUP",
	callended: "HANGUP",
	call_ended: "HANGUP",
	completed: "HANGUP",
	complete: "HANGUP",
};

const STATUS_FOR_EVENT: Record<VoiceEvent, CallStatus> = {
	RING: CallStatus.RINGING,
	ANSWER: CallStatus.IN_PROGRESS,
	VOICEMAIL: CallStatus.IN_PROGRESS,
	TRANSFER: CallStatus.IN_PROGRESS,
	RECORDING_START: CallStatus.IN_PROGRESS,
	HANGUP: CallStatus.COMPLETED,
	SIP_ERROR: CallStatus.FAILED,
	NO_ANSWER: CallStatus.NO_ANSWER,
	BUSY: CallStatus.BUSY,
	CANCELLED: CallStatus.CANCELLED,
};

const EVENT_TYPE: Record<VoiceEvent, CallEventType> = {
	RING: CallEventType.RING,
	ANSWER: CallEventType.ANSWER,
	VOICEMAIL: CallEventType.VOICEMAIL,
	TRANSFER: CallEventType.TRANSFER,
	RECORDING_START: CallEventType.RECORDING_START,
	HANGUP: CallEventType.HANGUP,
	SIP_ERROR: CallEventType.SIP_ERROR,
	NO_ANSWER: CallEventType.HANGUP,
	BUSY: CallEventType.HANGUP,
	CANCELLED: CallEventType.HANGUP,
};

const EVENT_FOR_STATUS: Record<CallStatus, VoiceEvent> = {
	[CallStatus.QUEUED]: "RING",
	[CallStatus.RINGING]: "RING",
	[CallStatus.IN_PROGRESS]: "ANSWER",
	[CallStatus.COMPLETED]: "HANGUP",
	[CallStatus.FAILED]: "SIP_ERROR",
	[CallStatus.NO_ANSWER]: "NO_ANSWER",
	[CallStatus.BUSY]: "BUSY",
	[CallStatus.CANCELLED]: "CANCELLED",
};

function authorised(request: Request): boolean {
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
	if (!secret) return false;

	const header = request.headers.get("authorization") ?? "";
	const expected = `Bearer ${secret}`;
	if (header.length !== expected.length) return false;
	try {
		return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
	} catch {
		return false;
	}
}

function normalize(value: string): string {
	return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function decimal(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
	return null;
}

function inferEventType(body: Record<string, unknown>): VoiceEvent {
	const rawEvent = typeof body.event === "string" ? normalize(body.event) : null;
	if (rawEvent && rawEvent in EVENT_TOKEN) return EVENT_TOKEN[rawEvent]!;

	const numeric = decimal(body.code) ?? decimal(body.status);
	if (numeric !== null) {
		return EVENT_FOR_STATUS[callCode(numeric, numeric).status];
	}

	const rawStatus = typeof body.status === "string" ? normalize(body.status) : null;
	if (rawStatus && rawStatus in EVENT_TOKEN) return EVENT_TOKEN[rawStatus]!;

	return "HANGUP";
}

export default defineChannel({
	routes: [
		POST("/internal/voice/events", async (request) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return new Response("Invalid JSON body", { status: 400 });
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) {
				return new Response("Expected a JSON object", { status: 400 });
			}

			const record = body as Record<string, unknown>;
			const sipCallId =
				typeof record.sipCallId === "string"
					? record.sipCallId
					: typeof record.callId === "string"
						? record.callId
						: typeof record.call_id === "string"
							? record.call_id
							: typeof record.id === "string"
								? record.id
								: null;
			if (!sipCallId) {
				return new Response("Missing call identifier", { status: 400 });
			}

			const call = await db.call.findFirst({ where: { sipCallId } });
			if (!call) {
				return new Response("Unknown call", { status: 404 });
			}

			const event = inferEventType(record);
			const eventType = EVENT_TYPE[event];
			const nextStatus = STATUS_FOR_EVENT[event];
			const terminal = isTerminalStatus(nextStatus);

			const update: Prisma.CallUpdateInput = {};
			if (!isTerminalStatus(call.status)) {
				update.status = nextStatus;

				if (event === "ANSWER" && !call.answeredAt) {
					update.answeredAt = new Date();
				}

				if (terminal && !call.endedAt) {
					const endedAt = new Date();
					update.endedAt = endedAt;
					const anchor = call.answeredAt ?? call.startedAt;
					if (anchor) {
						update.durationSecs = Math.max(
							0,
							Math.round((endedAt.getTime() - anchor.getTime()) / 1000),
						);
					}
				}
			}

			await db.$transaction([
				db.call.update({ where: { id: call.id }, data: update }),
				db.callEvent.create({
					data: { callId: call.id, type: eventType, payload: record as Prisma.InputJsonValue },
				}),
			]);

			return new Response(null, { status: 204 });
		}),
	],

	events: {},
});