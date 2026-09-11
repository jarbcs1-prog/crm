import { defineAgent } from "eve";

/**
 * Supervisor agent — the No. 1 agent of the platform.
 *
 * Built on eve. Runs as a durable agent with instructions, tools,
 * skills and a pulse schedule. Phase 1: exists, delegates, manages
 * permissions, queries status, investigates, runs a periodic pulse.
 *
 * State, events and capabilities live in the shared SQLite database
 * (supervisor_state.db), readable by both the Supervisor (TypeScript/eve)
 * and TheSEAS modules (Python).
 */
export default defineAgent({
  description: "The Supervisor — team leader, main delegator, directorship-level coordinator. Domain: the Control Room.",
  instructions: "agent/instructions.md",
  tools: {
    delegate: "agent/tools/delegate.ts",
    permissions: "agent/tools/permissions.ts",
    status: "agent/tools/status.ts",
    investigate: "agent/tools/investigate.ts",
    notify: "agent/tools/notify.ts",
  },
  skills: [
    "agent/skills/supervisor-control-room.md",
    "agent/skills/delegation-protocol.md",
    "agent/skills/agent-coordination.md",
  ],
  schedules: [
    "agent/schedules/control-room-pulse.ts",
  ],
  model: "openai/gpt-4o", // phase-1 placeholder — configurable
});
