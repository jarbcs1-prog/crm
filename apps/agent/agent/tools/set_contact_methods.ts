import { db } from "@crm/db";
import { z } from "zod";
import { type Evidence, type EvidenceKind, WEIGHTS } from "../lib/evidence";
import { recordFact } from "../lib/facts";
import { focusOn } from "../lib/focus";
import { defineTool } from "./tool-factory";

const KINDS = ["EMAIL", "PHONE"] as const;

type Outcome = {
	kind: (typeof KINDS)[number];
	value: string;
	band: string | null;
	applied: boolean;
	primary?: boolean;
	reason?: string;
};

export default defineTool({
	description:
		"Write a contact's email addresses and phone numbers after verifying each one. Every value is priced against the evidence you observed and only a VERIFIED claim reaches the record; anything weaker is kept as a proposal a rep settles. This is the only route to an email or phone write — record_fact stores the claim but does not apply it, because imported values are prefilled rather than human-entered.",
	inputSchema: z.object({
		contactId: z.string(),
		methods: z
			.array(
				z.object({
					kind: z.enum(KINDS).describe("EMAIL or PHONE."),
					value: z
						.string()
						.min(1)
						.describe("The value exactly as the source states it."),
					label: z
						.string()
						.optional()
						.describe(
							'What kind of number it is: "mobile", "direct", "switchboard".',
						),
					primary: z
						.boolean()
						.default(false)
						.describe(
							"Also set it as the contact's primary email or phone on the record.",
						),
				}),
			)
			.min(1)
			.describe("Everything you verified. One entry per address or number."),
		evidence: z
			.array(
				z.object({
					kind: z
						.enum(Object.keys(WEIGHTS) as [EvidenceKind, ...EvidenceKind[]])
						.describe(
							"What kind of thing you saw. Use `contradiction` when two sources disagree.",
						),
					detail: z
						.string()
						.describe(
							"What it actually said, in one line a rep would understand.",
						),
					sourceUrl: z.string().optional(),
				}),
			)
			.min(1)
			.describe("Everything you observed. One entry per independent source."),
		method: z
			.string()
			.describe(
				'Where it came from: "linkedin.profile", "crm.signature-block", "web".',
			),
		sourceUrl: z
			.string()
			.optional()
			.describe("The page a rep should open to check."),
	}),
	async execute({ contactId, methods, evidence, method, sourceUrl }) {
		focusOn({ contactId });

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { id: true },
		});

		if (!contact) {
			return { written: false as const, reason: "No such contact." };
		}

		const outcomes: Outcome[] = [];

		for (const entry of methods) {
			const field = entry.kind === "EMAIL" ? "email" : "phone";

			const fact = await recordFact({
				contactId,
				field,
				value: entry.value,
				evidence: evidence as Evidence[],
				method,
				sourceUrl,
			});

			if (!fact.applied) {
				outcomes.push({
					kind: entry.kind,
					value: entry.value,
					band: fact.band,
					applied: false,
					reason: fact.reason,
				});
				continue;
			}

			await db.contactMethod.upsert({
				where: {
					contactId_kind_value: {
						contactId,
						kind: entry.kind,
						value: entry.value,
					},
				},
				create: {
					contactId,
					kind: entry.kind,
					value: entry.value,
					label: entry.label ?? null,
				},
				update: { label: entry.label ?? null },
			});

			if (entry.primary) {
				const primary =
					entry.kind === "EMAIL"
						? { email: entry.value }
						: { phone: entry.value };
				await db.contact.update({ where: { id: contactId }, data: primary });
			}

			outcomes.push({
				kind: entry.kind,
				value: entry.value,
				band: fact.band,
				applied: true,
				primary: entry.primary,
			});
		}

		const written = outcomes.some((outcome) => outcome.applied);

		return {
			written,
			outcomes,
			note: written
				? undefined
				: "Nothing was written. Weak evidence becomes a proposal a rep settles — that is the correct outcome, not a reason to raise the score.",
		};
	},
});
