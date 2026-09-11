import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Supervisor tool: notify about status, alerts and reports.
 *
 * Phase 1: records a notification as a platform event. Actual delivery
 * (to a channel, to the human operator, to another agent) is a later-phase
 * concern. Phase 1 records the intent and the content so the notification
 * exists in the platform's records.
 */
export default defineTool({
  name: "notify",
  description: "Notify about status, alerts and reports. Records the notification in the platform so it exists for whoever needs to see it.",
  inputSchema: z.object({
    level: z.enum(["info", "notice", "warning", "alert"]).default("info").describe("Severity of the notification."),
    message: z.string().min(1).describe("What to communicate."),
    audience: z.string().optional().describe("Who this is for — agent id, team, workspace or human operator."),
    subject: z.string().optional().describe("What the notification is about."),
    details: z.record(z.unknown()).optional().describe("Additional structured details."),
  }),
  execute: async ({ level, message, audience, subject, details }, ctx) => {
    const event = {
      type: "notification",
      level,
      message,
      subject: subject ?? null,
      audience: audience ?? "platform",
      details: details ?? {},
      notified_at: new Date().toISOString(),
    };

    ctx.log("notification", event);

    return {
      ok: true,
      notification_id: `notif-${Date.now()}`,
      level,
      message,
      note: "Notification recorded. Delivery path to be wired in later phases.",
    };
  },
});
