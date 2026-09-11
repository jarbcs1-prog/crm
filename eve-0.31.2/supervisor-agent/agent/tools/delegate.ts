import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Supervisor tool: delegate work to a subordinate agent or team.
 *
 * Phase 1: creates a task record and assigns it. The actual execution
 * may be by a local subagent, a remote agent or a TheSEAS module via
 * the shared SQLite store — the delegation records the intent and
 * authority; the runtime decides the execution path.
 */
export default defineTool({
  name: "delegate",
  description: "Delegate work to a subordinate agent or team. Use when a task can be done by someone else — the Supervisor's role is coordination, not routine execution.",
  inputSchema: z.object({
    task: z.string().min(1).describe("What needs to be done. Be specific — the delegatee needs enough to act."),
    assignee: z.string().min(1).describe("Which agent, team or workspace handles this. Use agent id, team name or workspace label."),
    priority: z.enum(["low", "normal", "high", "critical"]).default("normal").describe("How urgent this is."),
    context: z.record(z.unknown()).optional().describe("Additional context for the delegatee — workspace, constraints, relevant state."),
    expected_outcome: z.string().optional().describe("What done looks like. If omitted, the delegatee decides."),
  }),
  execute: async ({ task, assignee, priority, context, expected_outcome }, ctx) => {
    // Phase 1: record the delegation as a platform event and state.
    // In later phases, this may dispatch to a subagent, remote agent,
    // or TheSEAS task queue. For now, the event + state is the record.
    const event = {
      type: "task_delegated",
      priority,
      assignee,
      task_summary: task.slice(0, 200),
      has_expected_outcome: !!expected_outcome,
      context_keys: context ? Object.keys(context) : [],
      delegated_at: new Date().toISOString(),
    };

    // Write to the shared SQLite store via the Python CLI or via
    // direct better-sqlite3 access if the node sqlite binding is available.
    // Phase 1 fallback: the event is the delegation record.
    ctx.log("delegation", event);

    return {
      ok: true,
      delegation_id: `del-${Date.now()}`,
      assignee,
      priority,
      task_summary: task.slice(0, 200),
      note: "Delegation recorded. Execution path determined by runtime.",
    };
  },
});
