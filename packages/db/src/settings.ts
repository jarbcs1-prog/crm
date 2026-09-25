import type { Db } from "./client";

export const SETTINGS_ID = "app";

export const VOICE_PROVIDERS = [
	"nonoh",
	"voipstudio",
	"twilio",
	"plivo",
	"vapi",
] as const;

export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export function isVoiceProvider(value: unknown): value is VoiceProvider {
	return typeof value === "string" && VOICE_PROVIDERS.includes(value as VoiceProvider);
}

function hasEnv(
	env: Record<string, string | undefined>,
	...keys: string[]
): boolean {
	return keys.every((key) => Boolean(env[key]?.trim()));
}

export function voiceProviderConfigured(
	provider: VoiceProvider,
	env: Record<string, string | undefined> = process.env,
): boolean {
	switch (provider) {
		case "nonoh":
			return hasEnv(env, "NONOH_SIP_SERVER", "NONOH_USERNAME", "NONOH_PASSWORD");
		case "voipstudio":
			return hasEnv(env, "VOIPSTUDIO_API_KEY");
		case "twilio":
			return (
				hasEnv(env, "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_CALLER_ID") &&
				(Boolean(env.TWILIO_TWIML_URL?.trim()) || Boolean(env.TWILIO_TWIML?.trim()))
			);
		case "plivo":
			return (
				hasEnv(env, "PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_ANSWER_URL") &&
				Boolean(env.PLIVO_CALLER_ID?.trim() || env.TWILIO_CALLER_ID?.trim())
			);
		case "vapi":
			return hasEnv(env, "VAPI_API_KEY", "VAPI_PHONE_NUMBER_ID");
	}
}

function readEnv(key: string): string | undefined {
	const value = process.env[key]?.trim();
	return value && value.length > 0 ? value : undefined;
}

export function selectDefaultModel(): {
	id: string;
	contextWindowTokens: number;
} {
	const providerOrder = [
		{ env: "OLLAMA_BASE_URL", modelEnv: "OLLAMA_MODEL", prefix: "ollama" },
		{
			env: "LMSTUDIO_BASE_URL",
			modelEnv: "LMSTUDIO_MODEL",
			prefix: "lmstudio",
		},
		{ env: "KOBOLD_BASE_URL", modelEnv: "KOBOLD_MODEL", prefix: "kobold" },
		{ env: "LLAMA_CPP_BASE_URL", modelEnv: undefined, prefix: "llamacpp" },
		{ env: "OPENCODE_API_URL", modelEnv: undefined, prefix: "opencode" },
		{
			env: "OPENROUTER_API_KEY",
			modelEnv: "OPENROUTER_MODEL",
			prefix: "openrouter",
		},
		{ env: "REPLICATE_API_TOKEN", modelEnv: undefined, prefix: "replicate" },
	] as const;

	for (const provider of providerOrder) {
		if (!readEnv(provider.env)) continue;
		const model = provider.modelEnv ? readEnv(provider.modelEnv) : undefined;
		return {
			id: model ? `${provider.prefix}/${model}` : `${provider.prefix}/model`,
			contextWindowTokens: 1_000_000,
		};
	}

	return { id: "ollama/qwen2.5-coder:14b", contextWindowTokens: 1_000_000 };
}

export const DEFAULT_AGENT_MODEL = selectDefaultModel();

export interface AgentModelSetting {
	id: string;
	contextWindowTokens: number;
	isDefault: boolean;
}

export async function readAgentModel(db: Db): Promise<AgentModelSetting> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { agentModelId: true, agentModelContextWindow: true },
	});

	if (!row?.agentModelId) {
		return { ...DEFAULT_AGENT_MODEL, isDefault: true };
	}

	return {
		id: row.agentModelId,
		contextWindowTokens:
			row.agentModelContextWindow ?? DEFAULT_AGENT_MODEL.contextWindowTokens,
		isDefault: false,
	};
}

export async function writeAgentModel(
	db: Db,
	model: { id: string; contextWindowTokens: number } | null,
): Promise<void> {
	const fields = {
		agentModelId: model?.id ?? null,
		agentModelContextWindow: model?.contextWindowTokens ?? null,
	};

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ...fields },
		update: fields,
	});
}

export interface VoiceProviderState {
	selectedId: VoiceProvider | null;
	valid: boolean;
}

export async function readVoiceProviderState(db: Db): Promise<VoiceProviderState> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { voiceProvider: true },
	});
	const value = row?.voiceProvider;
	if (value === null || value === undefined) {
		return { selectedId: null, valid: true };
	}
	if (isVoiceProvider(value)) {
		return { selectedId: value, valid: true };
	}
	return { selectedId: null, valid: false };
}

export async function writeVoiceProvider(
	db: Db,
	provider: VoiceProvider | null,
): Promise<void> {
	const fields = { voiceProvider: provider };
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ...fields },
		update: fields,
	});
}
