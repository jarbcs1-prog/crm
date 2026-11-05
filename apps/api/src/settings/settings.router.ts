import { Inject } from "@nestjs/common";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import {
	setAgentModelInput,
	setVoiceProviderInput,
} from "./settings.contracts";
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
	async voiceProvider(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.voiceProvider(ctx.user.id);
	}

	@Query()
	async modelCatalog() {
		return this.settings.modelCatalog();
	}

	@Query()
	async localProviders() {
		return this.settings.localProviders();
	}

	@Mutation({ input: setVoiceProviderInput })
	async setVoiceProvider(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setVoiceProviderInput>,
	) {
		return this.settings.setVoiceProvider(input.provider, ctx.user.id);
	}

	@Mutation({ input: setAgentModelInput })
	async setAgentModel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAgentModelInput>,
	) {
		return this.settings.setAgentModel(input.modelId, ctx.user.id);
	}
}
