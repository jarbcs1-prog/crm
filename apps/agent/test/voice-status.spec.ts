import { describe, expect, it } from "bun:test";
import { CallStatus } from "@crm/db";
import { callCode } from "../agent/lib/voice";

describe("hosted call state normalization", () => {
	it("maps hosted in-progress states", () => {
		expect(callCode("in-progress", null).status).toBe(CallStatus.IN_PROGRESS);
		expect(callCode("answered", null).status).toBe(CallStatus.IN_PROGRESS);
	});

	it("maps hosted terminal states", () => {
		expect(callCode("completed", null).status).toBe(CallStatus.COMPLETED);
		expect(callCode("ended", null).status).toBe(CallStatus.COMPLETED);
		expect(callCode("busy", null).status).toBe(CallStatus.BUSY);
		expect(callCode("no-answer", null).status).toBe(CallStatus.NO_ANSWER);
		expect(callCode("failed", null).status).toBe(CallStatus.FAILED);
	});

	it("maps hosted queued and voicemail states", () => {
		expect(callCode("queued", null).status).toBe(CallStatus.RINGING);
		expect(callCode("ringing", null).status).toBe(CallStatus.RINGING);
		expect(callCode("voicemail", null).status).toBe(CallStatus.IN_PROGRESS);
	});
});
