import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Supervisor tool: manage permissions for workspaces, tools and capabilities.
 *
 * Phase 1: grant and revoke access. The permission record is written as a
 * platform event so both the Supervisor and TheSEAS modules can see what's
 * in effect. Full enforcement (preventing an agent from actually using a
 * tool it's not permitted to) comes in later phases — phase 1 records the
 * decision and the authority.
 */
export default defineTool({
  name: "permissions",
  description: "Grant or revoke access to workspaces, tools and capabilities. The Supervisor controls the permission surface of the platform.",
  inputSchema: z.object({
    action: z.enum(["grant", "revoke"]).describe("Whether to grant or revoke access."),
    target: z.string().min(1).describe("What is being permitted or revoked — workspace name, tool name, capability id or agent id."),
    principal: z.string().min(1).describe("Who receives or loses the permission — agent id, team name, workspace label."),
    scope: z.enum(["workspace", "tool", "capability", "agent"]).default("workspace").describe("The kind of thing being permitted."),
    reason: z.string().optional().describe("Why this permission is being granted or revoked. Document the justification."),
  }),
  execute: async ({ action, target, principal, scope, reason }, ctx) => {
    const event = {
      type: action === "grant" ? "permission_granted" : "permission_revoked",
      target,
      principal,
      scope,
      reason: reason ?? (action === "grant" ? "Supervisor grant" : "Supervisor revocation"),
      changed_at: new Date().toISOString(),
    };

    ctx.log("permission", event);

    return {
      ok: true,
      action,
      target,
      principal,
      scope,
      permission_id: `perm-${Date.now()}`,
      note: `Permission ${action === "grant" ? "granted" : "revoked"}. Recorded for platform awareness.`,
    };
  },
});
