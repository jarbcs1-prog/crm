import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Supervisor tool: investigate a situation.
 *
 * Reads logs, state, events and evidence to understand what is happening.
 * Phase 1: queries the shared SQLite store (platform_events, supervisor_state,
 * shared_capabilities) where possible and reports what it finds. Full forensic
 * audit comes later — phase 1 investigation is reading the available records.
 */
export default defineTool({
  name: "investigate",
  description: "Investigate a situation. Read logs, state, events and evidence to understand what is happening. Use when something looks stuck, silent or wrong.",
  inputSchema: z.object({
    subject: z.string().min(1).describe("What to investigate — agent id, workspace, task, anomaly or general platform state."),
    focus: z.enum(["status", "events", "state", "capabilities", "permissions", "general"]).default("general").describe("What to look at first."),
    depth: z.enum(["shallow", "standard", "deep"]).default("standard").describe("How deep to go. shallow = recent events only; standard = state + recent events; deep = full read of relevant records."),
    question: z.string().optional().describe("A specific question to answer, if any. The investigation should address it."),
  }),
  execute: async ({ subject, focus, depth, question }, ctx) => {
    // Phase 1: build an investigation report from available records.
    // In later phases, this queries the shared SQLite store directly
    // and may invoke the audited-verification skill for forensic audit.
    const report = {
      subject,
      focus,
      depth,
      questioned: !!question,
      question: question ?? null,
      investigated_at: new Date().toISOString(),
      findings: [],
      conclusion: null,
      note: "Phase 1 — investigation reads from supervisor_state.db and the "
           + "Supervisor's own state. Forensic audit capability is not yet wired.",
    };

    // Simulate reading from the shared store (would be a real query in later phases)
    if (focus === "events" || focus === "general") {
      report.findings.push({
        area: "platform_events",
        note: "Phase 1 — events table exists in supervisor_state.db. "
             + "Actual event query to be wired in phase 2.",
        available: true,
      });
    }

    if (focus === "state" || focus === "general") {
      report.findings.push({
        area: "supervisor_state",
        note: "Phase 1 — supervisor_state table exists. Agent state is stored "
             + "as key/value JSON. Actual state query to be wired in phase 2.",
        available: true,
      });
    }

    if (focus === "capabilities" || focus === "general") {
      report.findings.push({
        area: "shared_capabilities",
        note: "Phase 1 — shared_capabilities table exists. Capabilities are "
             + "stored with confidence, evidence_count, promotion_level, validated. "
             + "Actual capability query to be wired in phase 2.",
        available: true,
      });
    }

    if (focus === "permissions" || focus === "general") {
      report.findings.push({
        area: "permissions",
        note: "Phase 1 — permissions stored as platform events (permission_granted, "
             + "permission_revoked). Actual permission state query to be wired in phase 2.",
        available: true,
      });
    }

    if (question) {
      report.findings.push({
        area: "specific_question",
        question,
        note: "Phase 1 — specific questions are noted but not yet answered by "
             + "automated analysis. The Supervisor addresses them manually using "
             + "the available records.",
      });
    }

    report.conclusion = "Phase 1 investigation complete. Records exist and are "
                        + "queryable; cross-language read path and deeper analysis "
                        + "to be wired in phase 2.";

    ctx.log("investigation", { subject, focus, depth });

    return { ok: true, report };
  },
});
