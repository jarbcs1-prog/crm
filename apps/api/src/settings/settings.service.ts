import { isWorkspaceAdmin } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	readAgentModel,
	readVoiceProviderState,
	SETTINGS_ID,
	selectDefaultModel,
	VOICE_PROVIDERS,
	type VoiceProvider,
	voiceProviderConfigured,
	writeAgentModel,
	writeVoiceProvider,
} from "@crm/db/settings";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	type CatalogModel,
	ModelCatalogService,
} from "./model-catalog.service";

export interface LocalProvider {
	name: string;
	endpoint: string;
	modelId: string | null;
}

export interface AgentModelSettings {
	selectedId: string | null;
	effectiveId: string;
	defaultId: string;
	effective: CatalogModel | null;
	updatedAt: string | null;
}

export interface ModelCatalogResult {
	models: CatalogModel[];
	available: boolean;
}

export interface VoiceProviderOption {
	id: VoiceProvider;
	label: string;
	configured: boolean;
}

export interface VoiceProviderSettings {
	selectedId: VoiceProvider | null;
	invalid: boolean;
	canConfigure: boolean;
	options: VoiceProviderOption[];
	updatedAt: string | null;
}

const VOICE_PROVIDER_LABELS: Record<VoiceProvider, string> = {
	nonoh: "Nonoh.net SIP",
	voipstudio: "VoIP Studio",
	twilio: "Twilio",
	plivo: "Plivo",
	vapi: "Vapi",
};

@Injectable()
export class SettingsService {
	private readonly logger = new Logger(SettingsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly catalog: ModelCatalogService,
	) {}

	async agentModel(): Promise<AgentModelSettings> {
		const [model, row] = await Promise.all([
			readAgentModel(this.db),
			this.db.appSetting.findFirst({ select: { updatedAt: true } }),
		]);

		return {
			selectedId: model.isDefault ? null : model.id,
			effectiveId: model.id,
			defaultId: selectDefaultModel().id,
			effective: await this.catalog.find(model.id),
			updatedAt: row?.updatedAt.toISOString() ?? null,
		};
	}

	async voiceProvider(actingUserId?: string): Promise<VoiceProviderSettings> {
		const [state, row, member] = await Promise.all([
			readVoiceProviderState(this.db),
			this.db.appSetting.findUnique({
				where: { id: SETTINGS_ID },
				select: { updatedAt: true },
			}),
			actingUserId
				? this.db.member.findUnique({
						where: {
							organizationId_userId: {
								organizationId: WORKSPACE_ID,
								userId: actingUserId,
							},
						},
						select: { role: true },
					})
				: Promise.resolve(null),
		]);
		return {
			selectedId: state.selectedId,
			invalid: !state.valid,
			canConfigure: Boolean(
				member && isWorkspaceAdmin(member.role as never),
			),
			options: VOICE_PROVIDERS.map((id) => ({
				id,
				label: VOICE_PROVIDER_LABELS[id],
				configured: voiceProviderConfigured(id),
			})),
			updatedAt: row?.updatedAt.toISOString() ?? null,
		};
	}

	async setVoiceProvider(
		provider: VoiceProvider | null,
		actingUserId?: string,
	): Promise<VoiceProviderSettings> {
		if (actingUserId) {
			const member = await this.db.member.findUnique({
				where: {
					organizationId_userId: {
						organizationId: WORKSPACE_ID,
						userId: actingUserId,
					},
				},
				select: { role: true },
			});
			if (!member || !isWorkspaceAdmin(member.role as never)) {
				throw new ForbiddenException(
					"Only an owner or an admin can change the voice provider.",
				);
			}
		}
		await writeVoiceProvider(this.db, provider);
		this.logger.log({
			message: "Voice provider setting changed",
			provider,
		});
		return this.voiceProvider(actingUserId);
	}

	async setAgentModel(
		modelId: string | null,
		actingUserId?: string,
	): Promise<AgentModelSettings> {
		if (actingUserId) {
			const member = await this.db.member.findUnique({
				where: {
					organizationId_userId: {
						organizationId: WORKSPACE_ID,
						userId: actingUserId,
					},
				},
				select: { role: true },
			});
			if (!member || !isWorkspaceAdmin(member.role as never)) {
				throw new ForbiddenException(
					"Only an owner or an admin can change the agent model.",
				);
			}
		}

		if (modelId === null) {
			await writeAgentModel(this.db, null);
			this.logger.log({ message: "Agent model reset to the default" });
			return this.agentModel();
		}

		const models = await this.catalog.models();

		if (!models) {
			throw new BadRequestException(
				"Could not reach the AI Gateway to check that model. Try again in a moment.",
			);
		}

		const chosen = models.find((model) => model.id === modelId);

		if (chosen) {
			await writeAgentModel(this.db, {
				id: chosen.id,
				contextWindowTokens: chosen.contextWindowTokens,
			});
		} else {
			this.logger.warn({
				message: "Saving agent model not in catalog",
				modelId,
			});
			await writeAgentModel(this.db, {
				id: modelId,
				contextWindowTokens: 128_000,
			});
		}

		this.logger.log({ message: "Agent model changed", modelId });

		return this.agentModel();
	}

	async modelCatalog(): Promise<ModelCatalogResult> {
		const models = await this.catalog.models();
		return { models: models ?? [], available: models !== null };
	}

	async localProviders(): Promise<LocalProvider[]> {
		const providers: LocalProvider[] = [];
		const checks: Array<{
			env: string;
			modelEnv: string | null;
			name: string;
			prefix: string;
			requiredEnv?: string;
		}> = [
			{
				env: "OLLAMA_BASE_URL",
				modelEnv: "OLLAMA_MODEL",
				name: "Ollama",
				prefix: "ollama",
			},
			{
				env: "LMSTUDIO_BASE_URL",
				modelEnv: "LMSTUDIO_MODEL",
				name: "LM Studio",
				prefix: "lmstudio",
			},
			{
				env: "KOBOLD_BASE_URL",
				modelEnv: "KOBOLD_MODEL",
				name: "KoboldCpp",
				prefix: "kobold",
			},
			{
				env: "LLAMA_CPP_BASE_URL",
				modelEnv: null,
				name: "llama.cpp",
				prefix: "llamacpp",
			},
			{
				env: "OPENCODE_API_URL",
				modelEnv: null,
				name: "Opencode",
				prefix: "opencode",
				requiredEnv: "OPENCODE_API_KEY",
			},
			{
				env: "OPENROUTER_API_KEY",
				modelEnv: "OPENROUTER_MODEL",
				name: "OpenRouter",
				prefix: "openrouter",
			},
			{
				env: "REPLICATE_API_TOKEN",
				modelEnv: null,
				name: "Replicate",
				prefix: "replicate",
			},
		];

		for (const p of checks) {
			if (p.requiredEnv && !process.env[p.requiredEnv]?.trim()) continue;
			const raw = process.env[p.env]?.trim();
			if (!raw) continue;
			const isUrl = p.env.endsWith("_BASE_URL") || p.env.endsWith("_API_URL");
			const endpoint = isUrl ? raw : `configured:${p.env}`;
			const model = p.modelEnv ? (process.env[p.modelEnv] ?? null) : null;
			providers.push({
				name: p.name,
				endpoint,
				modelId: model ? `${p.prefix}/${model}` : null,
			});
		}

		return providers;
	}
}
