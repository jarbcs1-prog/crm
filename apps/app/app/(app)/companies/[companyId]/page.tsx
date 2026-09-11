import { redirect } from "next/navigation";
import { recordHref } from "@/lib/record-href";

export default async function CompanyRedirect({
	params,
}: {
	params: Promise<{ companyId: string }>;
}) {
	const { companyId } = await params;
	redirect(recordHref("/companies", "company", companyId));
}
