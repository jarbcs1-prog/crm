import { db, OsintStatus } from "@crm/db";
import { z } from "zod";
import { defineTool } from "./tool-factory";

export default defineTool({
	description:
		"Lists the contacts that still need OSINT verification and enrichment, highest priority first, with the details a research agent needs to work the queue.",
	inputSchema: z.object({
		limit: z
			.number()
			.int()
			.min(1)
			.max(50)
			.optional()
			.describe("How many targets to return. Defaults to 10."),
	}),
	async execute({ limit }) {
		const targets = await db.osintTarget.findMany({
			where: { status: OsintStatus.PENDING },
			orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
			take: limit ?? 10,
			include: {
				contact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						title: true,
						company: {
							select: { name: true, country: true, countryCode: true },
						},
					},
				},
			},
		});

		const queue = targets.map((target) => ({
			targetId: target.id,
			contactId: target.contactId,
			name: target.contact
				? `${target.contact.firstName} ${target.contact.lastName ?? ""}`.trim()
				: null,
			email: target.contact?.email ?? null,
			phone: target.contact?.phone ?? null,
			title: target.contact?.title ?? null,
			company: target.contact?.company?.name ?? null,
			country: target.contact?.company?.country ?? null,
			countryCode: target.contact?.company?.countryCode ?? null,
			priority: target.priority,
			reason: target.reason,
		}));

		return { queue, count: queue.length };
	},
});
