import { db } from "@crm/db";
import { z } from "zod";
import { writeTimelineNote } from "../lib/crm";
import { defineTool } from "../lib/tool-factory";

export async function updateContact(input: {
	contactId: string;
	phone?: string;
	email?: string;
	companyName?: string;
	notes?: string;
	verificationStatus?: "UNVERIFIED" | "VERIFYING" | "NEEDS_HUMAN" | "VERIFIED";
}) {
	const { contactId, phone, email, companyName, notes, verificationStatus } =
		input;

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { id: true, firstName: true, lastName: true, ownerId: true },
	});

	if (!contact) {
		return { ok: false as const, reason: "No such contact." };
	}

	const data: any = {};

	if (phone !== undefined) data.phone = phone;
	if (email !== undefined) data.email = email;
	if (verificationStatus !== undefined)
		data.verificationStatus = verificationStatus;

	if (companyName !== undefined) {
		const company = await db.company.findFirst({
			where: { name: companyName },
			select: { id: true },
		});

		if (company) {
			data.companyId = company.id;
		} else {
			const createdCompany = await db.company.create({
				data: { name: companyName },
				select: { id: true },
			});
			data.companyId = createdCompany.id;
		}
	}

	if (Object.keys(data).length > 0) {
		await db.contact.update({ where: { id: contactId }, data });
	}

	if (notes) {
		await writeTimelineNote(contactId, "Contact note", notes, { notes });
	}

	return {
		ok: true as const,
		contactId,
		updated: Object.keys(data).length > 0,
		noteAdded: !!notes,
	};
}

export default defineTool({
	description:
		"Updates a contact's phone, email, company, verification status, or adds a note. Use after successful calls, OSINT enrichment, or when correcting contact details.",
	inputSchema: z.object({
		contactId: z.string().min(1).describe("The contact to update."),
		phone: z.string().optional().describe("New phone number."),
		email: z.string().optional().describe("New email address."),
		companyName: z.string().optional().describe("New company name."),
		notes: z
			.string()
			.optional()
			.describe("A note to append to the contact's timeline."),
		verificationStatus: z
			.enum(["UNVERIFIED", "VERIFYING", "NEEDS_HUMAN", "VERIFIED"])
			.optional()
			.describe("New verification status."),
	}),
	async execute(input: {
		contactId: string;
		phone?: string;
		email?: string;
		companyName?: string;
		notes?: string;
		verificationStatus?:
			| "UNVERIFIED"
			| "VERIFYING"
			| "NEEDS_HUMAN"
			| "VERIFIED";
	}) {
		return updateContact(input);
	},
});
