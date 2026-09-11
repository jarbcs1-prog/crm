"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { useTRPC } from "@/lib/trpc/client";
import { overviewParsers } from "./overview-search-params";

export function OverviewGreeting() {
	const trpc = useTRPC();
	const { data: me } = useSuspenseQuery(trpc.users.me.queryOptions());
	const [scope] = useQueryState("scope", overviewParsers.scope);

	return (
		<>
			<PageShellTitle>Welcome back, {me.name.split(" ")[0]}</PageShellTitle>
			<PageShellDescription>
				{scope === "me"
					? "What you have closed, what is still in play and what needs you today."
					: "What the team has closed, what is still in play and what needs you today."}
			</PageShellDescription>
		</>
	);
}
