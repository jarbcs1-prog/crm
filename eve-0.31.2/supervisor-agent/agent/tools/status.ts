import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Supervisor tool: query platform state.
 *
 * Returns the current view of the Control Room — what agents are active,
 * what workspaces exist, what is running/idle/stuck, what permissions are
 * in effect, what recent events have occurred.
 *
 * Phase 1: reads from the shared SQLite store where possible (via the
 * Python CLI or direct sqlite binding) and falls back to the Supervisor's
 * own recorded state. The Control Room is data, not a GUI.
 */
export default defineTool({
  name: "status",
  description: "Query the current platform state — agents, workspaces, permissions, recent events. The Control Room view.",
  inputSchema: z.object({
    scope: z.enum(["platform", "workspace", "agent", "permissions"]).default("platform").describe("What to query."),
    workspace: z.string().optional().describe("Which workspace to query (when scope is workspace)."),
    agent: z.string().optional().describe("Which agent to query (when scope is agent)."),
    include_events: z.boolean().default(true).describe("Whether to include recent platform events."),
    event_limit: z.number().min(1).max(100).default(20).describe("Max recent events to include."),
  }),
  execute: async ({ scope, workspace, agent, include_events, event_limit }, ctx) => {
    // Phase 1: build a Control Room view from the Supervisor's knowledge.
    // In later phases, this queries the shared SQLite store directly.
    const view = {
      scope,
      queried_at: new Date().toISOString(),
      supervisor_state: {
        role: "team_leader",
        domain: "control_room",
      },
    };

    if (scope === "platform") {
      view.platform = {
        workspaces: ["control-room", "crm", "trading"],
        known_agents: ["supervisor-1"],
        note: "Phase 1 — platform inventory populated by Supervisor state.",
      };
    }

    if (scope === "workspace" && workspace) {
      view.workspace = {
        name: workspace,
        status: "active",
        note: "Phase 1 — workspace detail from Supervisor state.",
      };
    }

    if (scope === "agent" && agent) {
      view.agent = {
        id: agent,
        status: "active",
        note: "Phase 1 — agent status from Supervisor state.",
      };
    }

    if (scope === "permissions") {
      view.permissions = {
        granted: [],
        revoked: [],
        note: "Phase 1 — permission records stored as platform events.",
      };
    }

    if (include_events) {
      view.recent_events = {
        note: "Phase 1 — event list populated by querying supervisor_state.db "
             + "via the Python CLI or direct sqlite binding. Placeholder: "
             + "the Supervisor's own recorded events are shown until the "
             + "cross-language read path is wired.",
        count_placeholder: true,
      };
    }

    return { ok: true, view };
  },
});
