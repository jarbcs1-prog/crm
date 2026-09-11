import { redirect } from "next/navigation";
import { recordHref } from "@/lib/record-href";

export default async function ContactRedirect({
	params,
}: {
	params: Promise<{ contactId: string }>;
}) {
	const { contactId } = await params;
	redirect(recordHref("/contacts", "contact", contactId));
}
