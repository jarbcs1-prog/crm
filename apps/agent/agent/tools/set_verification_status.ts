import { db } from "@crm/db";
import { z } from "zod";
import { focusOn } from "../lib/focus";
import { defineTool } from "./tool-factory";

export default defineTool({
	description:
		"Move a contact's verification status. Claim the record with VERIFYING before you touch anything, then close it with VERIFIED when two or more independent sources agree, or NEEDS_HUMAN when the evidence is weak, conflicting or missing. Closing stamps lastVerifiedAt; claiming does not. Closing as NEEDS_HUMAN is a correct outcome, not a failure to work around.",
	inputSchema: z.object({
		contactId: z.string(),
		status: z
			.enum(["VERIFYING", "VERIFIED", "NEEDS_HUMAN"])
			.describe(
				"VERIFYING to claim the record, VERIFIED or NEEDS_HUMAN to close it.",
			),
	}),
	async execute({ contactId, status }) {
		focusOn({ contactId });

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { verificationStatus: true, lastVerifiedAt: true },
		});

		if (!contact) {
			return { updated: false as const, reason: "No such contact." };
		}

		const closing = status !== "VERIFYING";

		const updated = await db.contact.update({
			where: { id: contactId },
			data: {
				verificationStatus: status,
				...(closing ? { lastVerifiedAt: new Date() } : {}),
			},
			select: { verificationStatus: true, lastVerifiedAt: true },
		});

		return {
			updated: true as const,
			previous: contact.verificationStatus,
			status: updated.verificationStatus,
			lastVerifiedAt: updated.lastVerifiedAt?.toISOString() ?? null,
			...(closing
				? {}
				: {
						note: "Claimed. Close the record when you are done — do not leave it VERIFYING.",
					}),
		};
	},
});
