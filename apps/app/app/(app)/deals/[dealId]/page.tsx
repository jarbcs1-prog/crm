import { redirect } from "next/navigation";
import { recordHref } from "@/lib/record-href";

export default async function DealRedirect({
	params,
}: {
	params: Promise<{ dealId: string }>;
}) {
	const { dealId } = await params;
	redirect(recordHref("/deals", "deal", dealId));
}
