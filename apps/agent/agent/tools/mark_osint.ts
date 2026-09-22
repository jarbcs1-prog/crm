import { db, type FactBand, OsintStatus } from "@crm/db";
import { defineTool } from "./tool-factory";
import { z } from "zod";
import { writeTimelineNote } from "../lib/crm";

const CONFIDENCE: Record<FactBand, number> = {
	VERIFIED: 0.85,
	PROBABLE: 0.55,
	POSSIBLE: 0.3,
};

export default defineTool({
	description:
		"Applies OSINT findings to a contact: corrects the phone, email or title on the contact itself, files the finding with a confidence band and marks the target enriched.",
	inputSchema: z.object({
		contactId: z
			.string()
			.min(1)
			.describe("The contact the findings are about."),
		band: z
			.enum(["VERIFIED", "PROBABLE", "POSSIBLE"])
			.describe("How certain the source was."),
		phone: z
			.string()
			.optional()
			.describe("The phone number as found by the research."),
		email: z
			.string()
			.optional()
			.describe("The email address as found by the research."),
		title: z
			.string()
			.optional()
			.describe("The current title as found by the research."),
		notes: z
			.string()
			.optional()
			.describe("Where the finding came from and any caveats."),
	}),
	async execute({ contactId, band, phone, email, title, notes }) {
		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { id: true, phone: true, email: true, title: true },
		});
		if (!contact) return { ok: false as const, reason: "No such contact." };

		const corrections: Record<
			string,
			{ from: string | null; to: string | null }
		> = {};

		if (phone !== undefined && phone !== contact.phone) {
			corrections.phone = { from: contact.phone, to: phone };
			await db.contact.update({
				where: { id: contact.id },
				data: { phone: phone || null },
			});
		}
		if (email !== undefined && email !== contact.email) {
			corrections.email = { from: contact.email, to: email };
			await db.contact.update({
				where: { id: contact.id },
				data: { email: email || null },
			});
		}
		if (title !== undefined && title !== contact.title) {
			corrections.title = { from: contact.title, to: title };
			await db.contact.update({
				where: { id: contact.id },
				data: { title: title || null },
			});
		}

		const findings = {
			band,
			confidence: CONFIDENCE[band],
			corrections,
			notes: notes ?? null,
		};

		const existing = await db.osintTarget.findFirst({
			where: {
				contactId: contact.id,
				status: { in: [OsintStatus.PENDING, OsintStatus.IN_PROGRESS] },
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});

		let targetId: string;
		if (existing) {
			await db.osintTarget.update({
				where: { id: existing.id },
				data: {
					status: OsintStatus.ENRICHED,
					findings,
					correctedAt: new Date(),
					error: null,
				},
			});
			targetId = existing.id;
		} else {
			const created = await db.osintTarget.create({
				data: {
					contactId: contact.id,
					status: OsintStatus.ENRICHED,
					priority: band === "VERIFIED" ? 60 : 50,
					reason: `Enriched from OSINT at ${band.toLowerCase()} confidence`,
					findings,
					correctedAt: new Date(),
				},
				select: { id: true },
			});
			targetId = created.id;
		}

		const correctedFields = Object.keys(corrections);
		await writeTimelineNote(
			contact.id,
			"OSINT enrichment applied",
			`Corrected ${correctedFields.length} field(s) at ${band.toLowerCase()} confidence: ${correctedFields.join(", ") || "none"}.`,
			{ band, confidence: CONFIDENCE[band], corrections, targetId },
		);

		return {
			ok: true as const,
			targetId,
			applied: correctedFields,
			band,
			confidence: CONFIDENCE[band],
		};
	},
});
