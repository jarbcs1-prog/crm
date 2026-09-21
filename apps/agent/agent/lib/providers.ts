export type ProviderName =
	| "ollama"
	| "lmstudio"
	| "kobold"
	| "llamacpp"
	| "opencode"
	| "openrouter"
	| "replicate"
	| "deepgram"
	| "elevenlabs"
	| "cartesia"
	| "twilio"
	| "telnyx";

type ProviderConfig = {
	readonly keyEnvs: readonly string[];
	readonly endpointEnv?: string;
	readonly defaultEndpoint?: string;
	readonly modelEnv?: string;
};

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
	ollama: {
		keyEnvs: [],
		endpointEnv: "OLLAMA_BASE_URL",
		defaultEndpoint: "http://localhost:11434",
		modelEnv: "OLLAMA_MODEL",
	},
	lmstudio: {
		keyEnvs: [],
		endpointEnv: "LMSTUDIO_BASE_URL",
		defaultEndpoint: "http://localhost:1234/v1",
		modelEnv: "LMSTUDIO_MODEL",
	},
	kobold: {
		keyEnvs: [],
		endpointEnv: "KOBOLD_BASE_URL",
		defaultEndpoint: "http://localhost:5001",
		modelEnv: "KOBOLD_MODEL",
	},
	llamacpp: {
		keyEnvs: [],
		endpointEnv: "LLAMA_CPP_BASE_URL",
		defaultEndpoint: "http://localhost:8080",
	},
	opencode: {
		keyEnvs: ["OPENCODE_API_KEY"],
		endpointEnv: "OPENCODE_API_URL",
	},
	openrouter: {
		keyEnvs: ["OPENROUTER_API_KEY"],
		modelEnv: "OPENROUTER_MODEL",
	},
	replicate: {
		keyEnvs: ["REPLICATE_API_TOKEN"],
	},
	deepgram: {
		keyEnvs: ["DEEPGRAM_API_KEY"],
	},
	elevenlabs: {
		keyEnvs: ["ELEVENLABS_API_KEY"],
	},
	cartesia: {
		keyEnvs: ["CARTESIA_API_KEY"],
	},
	twilio: {
		keyEnvs: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
	},
	telnyx: {
		keyEnvs: ["TELNYX_API_KEY"],
	},
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS) as ProviderName[];

function read(key: string): string | undefined {
	const value = process.env[key]?.trim();
	return value && value.length > 0 ? value : undefined;
}

export function providerKey(name: ProviderName): string | undefined {
	for (const env of PROVIDERS[name].keyEnvs) {
		const value = read(env);
		if (value) return value;
	}
	return undefined;
}

export function providerEndpoint(name: ProviderName): string | undefined {
	const config = PROVIDERS[name];
	const override = config.endpointEnv ? read(config.endpointEnv) : undefined;
	return override ?? config.defaultEndpoint;
}

export function providerModel(name: ProviderName): string | undefined {
	const config = PROVIDERS[name];
	return config.modelEnv ? read(config.modelEnv) : undefined;
}

export function twilioCallerId(): string | undefined {
	return read("TWILIO_CALLER_ID");
}

export function telnyxCallerId(): string | undefined {
	return read("TELNYX_CALLER_ID");
}

export interface ConfiguredProvider {
	name: ProviderName;
	endpoint: string;
	modelId: string;
}

export function getConfiguredProviders(): ConfiguredProvider[] {
	const configured: ConfiguredProvider[] = [];

	const providerOrder: ProviderName[] = [
		"ollama",
		"lmstudio",
		"kobold",
		"llamacpp",
		"opencode",
		"openrouter",
		"replicate",
	];

	for (const name of providerOrder) {
		if (!isProviderConfigured(name)) continue;
		const endpoint = providerEndpoint(name) ?? "";
		const model = providerModel(name);
		const modelId = model ? `${name}/${model}` : `${name}/model`;
		configured.push({ name, endpoint, modelId });
	}

	return configured;
}

export function selectDefaultModel(): { id: string; contextWindowTokens: number } {
	const configured = getConfiguredProviders();
	if (configured.length > 0) {
		const first = configured[0]!;
		return { id: first.modelId, contextWindowTokens: 1_000_000 };
	}
	return { id: "ollama/qwen2.5-coder:14b", contextWindowTokens: 1_000_000 };
}

export function isProviderConfigured(name: ProviderName): boolean {
	const config = PROVIDERS[name];
	if (config.keyEnvs.length > 0) {
		return config.keyEnvs.every((env) => read(env) !== undefined);
	}
	return (
		(config.endpointEnv ? read(config.endpointEnv) : undefined) !== undefined
	);
}
