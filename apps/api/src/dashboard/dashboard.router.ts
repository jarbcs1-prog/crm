import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { dashboardSummaryInput } from "./dashboard.contracts";
import { DashboardService } from "./dashboard.service";

@Router({ alias: "dashboard" })
export class DashboardRouter {
	constructor(
		@Inject(DashboardService) private readonly dashboard: DashboardService,
	) {}

	@Query({ input: dashboardSummaryInput })
	async summary(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardSummaryInput>,
	) {
		return this.dashboard.summary(ctx.user.id, input);
	}
}
