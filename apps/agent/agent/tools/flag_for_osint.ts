import { OsintStatus, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description:
		"Flags a contact for OSINT verification and enrichment, or raises the priority of an existing open target for them.",
	inputSchema: z.object({
		contactId: z.string().min(1).describe("The contact to verify."),
		reason: z.string().min(1).describe("Why this contact needs verification."),
		priority: z.number().int().min(0).max(100).optional().describe("0-100, higher runs first. Defaults to 50."),
	}),
	async execute({ contactId, reason, priority }) {
		const contact = await db.contact.findUnique({ where: { id: contactId }, select: { id: true } });
		if (!contact) return { ok: false as const, reason: "No such contact." };

		const resolvedPriority = priority ?? 50;
		const existing = await db.osintTarget.findFirst({
			where: { contactId, status: { in: [OsintStatus.PENDING, OsintStatus.IN_PROGRESS] } },
			select: { id: true, priority: true },
		});

		if (existing) {
			await db.osintTarget.update({
				where: { id: existing.id },
				data: { priority: resolvedPriority, reason },
			});
			return { ok: true as const, targetId: existing.id, priority: resolvedPriority, alreadyFlagged: true as const };
		}

		const created = await db.osintTarget.create({
			data: { contactId, status: OsintStatus.PENDING, priority: resolvedPriority, reason },
			select: { id: true },
		});
		return { ok: true as const, targetId: created.id, priority: resolvedPriority, alreadyFlagged: false as const };
	},
});
