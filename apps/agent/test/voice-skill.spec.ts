import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { brief } from "../agent/lib/dispatch";
import type { LeasedTask } from "../agent/lib/tasks";
import loadPitch from "../agent/tools/load_pitch";

function task(kind: "call" | "voice-batch"): LeasedTask {
	return {
		id: `${kind}-test`,
		contactId: "contact-test",
		companyId: null,
		kind,
		reason: "test",
		budget: 5,
		attempts: 1,
		priority: 1,
		dueAt: new Date(),
	};
}

describe("voice task briefs", () => {
	it("loads the research-first skill before a single call", () => {
		const message = brief(task("call"));

		expect(message).toContain("load_skill");
		expect(message).toContain("voice-ai-cold-calling-research-first");
		expect(message).toContain("load_pitch");
		expect(message).toContain("research-first-cold-call-v1");
		expect(message).toContain("refusalBranches");
		expect(message).toContain("make_call");
		expect(message).toContain("speak_on_call");
		expect(message).toContain("listen_on_call");
		expect(message).toContain("record_call_outcome");
		expect(message).toContain("DO_NOT_CALL");
		expect(message).not.toContain("LEGAL_APPROACH_SCRIPT");
	});

	it("keeps batch pacing from weakening consent policy", () => {
		const message = brief(task("voice-batch"));

		expect(message).toContain("voice-ai-cold-calling-research-first");
		expect(message).toContain("research-first-cold-call-v1");
		expect(message).toContain("refusalBranches");
		expect(message).toContain("consent or refusal policy");
		expect(message).toContain("call_status");
		expect(message).toContain("record_call_outcome");
	});
});

describe("research-first pitch", () => {
	it("pins a product-neutral policy pitch with terminal branches", () => {
		const pitch = JSON.parse(
			readFileSync(
				new URL(
					"../data/pitches/research-first-cold-call-v1.json",
					import.meta.url,
				),
				"utf8",
			),
		) as {
			id: string;
			conversation: Array<{ id: string; text: string }>;
			refusal_branches: Array<{ id: string; action: string }>;
			consent_rules: Record<string, boolean>;
		};

		expect(pitch.id).toBe("research-first-cold-call-v1");
		expect(pitch.conversation.map((segment) => segment.id)).toEqual([
			"s1_identity",
			"s2_permission",
			"s3_discovery",
			"s4_next_step",
			"s5_close",
		]);
		expect(
			pitch.refusal_branches.some(
				(branch) => branch.action === "TERMINATE_AND_OPTOUT",
			),
		).toBe(true);
		expect(
			pitch.refusal_branches.some((branch) => branch.id === "r3_wrong_number"),
		).toBe(true);
		expect(pitch.consent_rules.positive_consent_required).toBe(true);
		expect(
			pitch.conversation.every(
				(segment) =>
					!/\$|https?:\/\/|Ourname|Shelf Thought/i.test(segment.text),
			),
		).toBe(true);
	});

	it("loads the pinned pitch with resolved placeholders and refusal branches", async () => {
		const result = (await loadPitch.execute(
			{
				pitchId: "research-first-cold-call-v1",
				firstName: "Ada",
				values: {
					company_name: "Example CRM",
					call_purpose: "a brief workflow review",
				},
			},
			{},
		)) as {
			pitchId?: string;
			schema?: string;
			segments?: Array<{ text: string }>;
			refusalBranches?: Array<{ id: string }>;
			consentRules?: Record<string, boolean>;
		};

		expect(result.pitchId).toBe("research-first-cold-call-v1");
		expect(result.schema).toBe("conversation");
		expect(result.segments?.[0]?.text).toContain("Ada");
		expect(result.segments?.[0]?.text).toContain("Example CRM");
		expect(result.segments?.[0]?.text).toContain("a brief workflow review");
		expect(
			result.refusalBranches?.some(
				(branch) => branch.id === "r2_do_not_contact",
			),
		).toBe(true);
		expect(result.consentRules?.positive_consent_required).toBe(true);
	});
});
