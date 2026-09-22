import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { setAgentModelInput } from "./settings.contracts";
import { SettingsService } from "./settings.service";

@Router({ alias: "settings" })
export class SettingsRouter {
	constructor(
		@Inject(SettingsService) private readonly settings: SettingsService,
	) {}

	@Query()
	async agentModel() {
		return this.settings.agentModel();
	}

	@Query()
	async modelCatalog() {
		return this.settings.modelCatalog();
	}

	@Query()
	async localProviders() {
		return this.settings.localProviders();
	}

	@Mutation({ input: setAgentModelInput })
	async setAgentModel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAgentModelInput>,
	) {
		return this.settings.setAgentModel(input.modelId, ctx.user.id);
	}
}
