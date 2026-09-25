import { describe, expect, it } from "bun:test";
import {
  arenaCompare,
  buildCallDataset,
  type CallRecord,
  callToSession,
  definedScores,
  judgeCallSession,
  variantByPitch,
} from "./callDataset.js";

const full: CallRecord = {
  id: "c1",
  transcript: "Agent: hello. User: yes, tell me more.",
  summary: "Interested, follow up agreed.",
  outcome: "FOLLOW_UP",
  scores: { interest: 0.8, motivation: 0.6, urgency: 0.5, experience: 0.7, budget: 0.4 },
  direction: "OUTBOUND",
  durationSeconds: 120,
  pitchId: "pitch-a",
};

describe("callToSession", () => {
  it("returns null when transcript and summary are both missing", () => {
    expect(callToSession({ id: "empty" })).toBeNull();
  });

  it("builds a two-turn call-transcript session with source tags", () => {
    const s = callToSession(full);
    expect(s?.meta.source).toBe("call-transcript");
    expect(s?.turns.length).toBe(2);
    expect(s?.meta.tags).toContain("source:call-transcript");
    expect(s?.meta.tags).toContain("outcome:FOLLOW_UP");
    expect(s?.meta.tags).toContain("pitch:pitch-a");
  });
});

describe("definedScores", () => {
  it("keeps finite numbers and drops nulls", () => {
    expect(definedScores({ id: "x", scores: { interest: 0.5, budget: null, urgency: Number.NaN } }).map((s) => s.key)).toEqual([
      "interest",
    ]);
  });
});

describe("judgeCallSession", () => {
  it("scores a complete record at 1", () => {
    const s = callToSession(full)!;
    const j = judgeCallSession(s);
    expect(j.score).toBe(1);
    expect(Object.values(j.checks).every(Boolean)).toBe(true);
  });

  it("penalizes missing outcome and scores", () => {
    const s = callToSession({ id: "thin", transcript: "hi" })!;
    const j = judgeCallSession(s);
    expect(j.score).toBeLessThan(1);
    expect(j.checks.hasOutcome).toBe(false);
    expect(j.checks.hasScores).toBe(false);
  });
});

describe("arenaCompare", () => {
  it("blinds pitch variants and crowns the higher mean", () => {
    const a = callToSession({ ...full, id: "a1", pitchId: "pitch-a" })!;
    const b = callToSession({ id: "b1", transcript: "hi", pitchId: "pitch-b" })!;
    const arena = arenaCompare([a, b], variantByPitch);
    expect(arena.blinded.length).toBe(2);
    expect(arena.blinded.map((e) => e.label).sort()).toEqual(["Variant A", "Variant B"]);
    const winnerVariant = arena.reveal[arena.winner!];
    expect(winnerVariant).toBe("pitch-a");
  });
});

describe("buildCallDataset", () => {
  it("dedups identical calls and skips empties", () => {
    const out = buildCallDataset([full, { ...full }, { id: "empty" }]);
    expect(out.sessions.length).toBe(1);
    expect(out.duplicates).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.judged.length).toBe(1);
  });

  it("redacts PII without dropping the session", () => {
    const out = buildCallDataset([{ ...full, id: "pii", transcript: "reach me at rep@example.com please" }]);
    expect(out.redacted).toBe(1);
    expect(out.sessions.length).toBe(1);
    expect(out.sessions[0]!.turns[0]!.content).not.toContain("rep@example.com");
  });
});
