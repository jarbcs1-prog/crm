import type { SearchParams } from "nuqs/server";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { DashboardSummary } from "./dashboard-summary";
import { OverviewGreeting } from "./overview-greeting";
import { OverviewScopeToggle } from "./overview-scope";
import { loadOverviewSearchParams } from "./overview-search-params";

export default async function OverviewPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	await requireSession();

	const { scope } = await loadOverviewSearchParams(searchParams);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.users.me.queryOptions()),
		queryClient.prefetchQuery(trpc.dashboard.summary.queryOptions({ scope })),
	]);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<HydrateClient>
						<OverviewGreeting />
					</HydrateClient>
				</PageShellHeading>
				<PageShellActions>
					<OverviewScopeToggle />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent>
				<HydrateClient>
					<DashboardSummary />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
