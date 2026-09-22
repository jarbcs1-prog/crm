import { db, RecordSource } from "@crm/db";
import { z } from "zod";
import { defineTool } from "./tool-factory";
import { focusOn } from "../lib/focus";

const CONTACT_FIELDS = {
	id: true,
	firstName: true,
	lastName: true,
	email: true,
	phone: true,
	title: true,
	companyId: true,
} as const;

function clean(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export default defineTool({
	description:
		"Create a contact — the only route to a new person in the CRM. Use it when a rep names someone who is not in the system, or to stand up a test lead profile. Give an email and it will not create a duplicate: an existing contact with that address is returned instead. The company can be passed as an id or a name; a name that matches nothing creates the company.",
	inputSchema: z.object({
		firstName: z
			.string()
			.trim()
			.min(1)
			.describe(
				"Given name. Required — the record will not accept a nameless person.",
			),
		lastName: z
			.string()
			.trim()
			.optional()
			.describe("Family name, if you have it."),
		email: z
			.email("That is not an email address.")
			.optional()
			.describe(
				"Email address. Used to return an existing contact instead of a duplicate.",
			),
		phone: z
			.string()
			.trim()
			.optional()
			.describe("Phone number exactly as given."),
		title: z
			.string()
			.trim()
			.optional()
			.describe('Job title, e.g. "Head of Operations".'),
		companyId: z
			.string()
			.optional()
			.describe(
				"Id of an existing company. Prefer this over companyName when you have it.",
			),
		companyName: z
			.string()
			.trim()
			.optional()
			.describe(
				"Employer name when you have no id. Matched case-insensitively; created when unknown.",
			),
		ownerId: z
			.string()
			.optional()
			.describe(
				"Id of the user who owns the contact. Defaults to the first user; a contact with no owner is valid.",
			),
	}),
	async execute({
		firstName,
		lastName,
		email,
		phone,
		title,
		companyId,
		companyName,
		ownerId,
	}) {
		const emailValue = clean(email)?.toLowerCase() ?? null;

		if (emailValue) {
			const existing = await db.contact.findUnique({
				where: { email: emailValue },
				select: CONTACT_FIELDS,
			});

			if (existing) {
				focusOn({ contactId: existing.id, companyId: existing.companyId });

				return {
					created: false as const,
					contact: existing,
					reason:
						"A contact with that email already exists — nothing was created.",
				};
			}
		}

		let resolvedCompanyId: string | null = null;

		if (companyId) {
			const company = await db.company.findUnique({
				where: { id: companyId },
				select: { id: true },
			});

			if (!company) {
				return { created: false as const, reason: "No such company." };
			}

			resolvedCompanyId = company.id;
		} else if (companyName) {
			const existing = await db.company.findFirst({
				where: { name: { equals: companyName, mode: "insensitive" } },
				select: { id: true },
			});

			if (existing) {
				resolvedCompanyId = existing.id;
			} else {
				const created = await db.company.create({
					data: { name: companyName, source: RecordSource.MANUAL },
					select: { id: true },
				});
				resolvedCompanyId = created.id;
			}
		}

		let resolvedOwnerId: string | null = null;

		if (ownerId) {
			const owner = await db.user.findUnique({
				where: { id: ownerId },
				select: { id: true },
			});

			if (!owner) {
				return {
					created: false as const,
					reason: "No such user to own the contact.",
				};
			}

			resolvedOwnerId = owner.id;
		} else {
			const owner = await db.user.findFirst({ select: { id: true } });
			resolvedOwnerId = owner?.id ?? null;
		}

		const contact = await db.contact.create({
			data: {
				firstName: firstName.trim(),
				lastName: clean(lastName),
				email: emailValue,
				phone: clean(phone),
				title: clean(title),
				companyId: resolvedCompanyId,
				ownerId: resolvedOwnerId,
				source: RecordSource.MANUAL,
			},
			select: CONTACT_FIELDS,
		});

		focusOn({ contactId: contact.id, companyId: contact.companyId });

		return { created: true as const, contact };
	},
});
