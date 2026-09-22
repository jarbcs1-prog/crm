import { plainToInstance, Type } from "class-transformer";
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUrl,
	Max,
	Min,
	MinLength,
	validateSync,
} from "class-validator";

export enum NodeEnv {
	Development = "development",
	Production = "production",
	Test = "test",
}

export class EnvironmentVariables {
	@IsEnum(NodeEnv)
	NODE_ENV: NodeEnv = NodeEnv.Development;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(65535)
	PORT = 3001;

	@IsString()
	@MinLength(1, {
		message:
			"DATABASE_URL is required. `docker compose up -d` starts one or set it to any Postgres connection string.",
	})
	DATABASE_URL!: string;

	@IsString()
	@MinLength(32, {
		message:
			"BETTER_AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
	})
	BETTER_AUTH_SECRET!: string;

	@IsString()
	@MinLength(1, {
		message:
			'ALLOWED_SIGN_IN is required — it is the only thing deciding who can sign in. Set it to your email domain, e.g. ALLOWED_SIGN_IN="acme.com" or to a single address for a one-person install.',
	})
	ALLOWED_SIGN_IN!: string;

	@IsOptional()
	@IsString()
	GOOGLE_CLIENT_ID?: string;

	@IsOptional()
	@IsString()
	GOOGLE_CLIENT_SECRET?: string;

	@IsOptional()
	@IsUrl({ require_tld: false })
	API_URL?: string;

	@IsOptional()
	@IsString()
	APP_URL?: string;

	@IsOptional()
	@IsString()
	AUTH_COOKIE_DOMAIN?: string;

	@IsOptional()
	@IsString()
	REDIS_URL?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	CACHE_TTL_MS?: number;

	@IsOptional()
	@IsString()
	@MinLength(16, {
		message: "CRON_SECRET must be at least 16 characters.",
	})
	CRON_SECRET?: string;

	@IsOptional()
	@IsString()
	BLOB_READ_WRITE_TOKEN?: string;

	@IsOptional()
	@IsString()
	VERCEL_BLOB_TOKEN?: string;

	@IsOptional()
	@IsUrl(
		{ require_tld: false, require_protocol: true },
		{
			message:
				"AGENT_URL must be a full URL with a scheme, like http://127.0.0.1:2000.",
		},
	)
	AGENT_URL?: string;

	@IsOptional()
	@IsString()
	@MinLength(32, {
		message:
			"AGENT_BRIDGE_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
	})
	AGENT_BRIDGE_SECRET?: string;

	@IsOptional()
	@IsString()
	NONOH_SIP_SERVER?: string;

	@IsOptional()
	@IsString()
	NONOH_USERNAME?: string;

	@IsOptional()
	@IsString()
	@MinLength(16, {
		message: "NONOH_PASSWORD must be at least 16 characters.",
	})
	NONOH_PASSWORD?: string;

	@IsOptional()
	@IsString()
	NONOH_DISPLAY_NAME?: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true })
	OLLAMA_BASE_URL?: string;

	@IsOptional()
	@IsString()
	OLLAMA_MODEL?: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true })
	LMSTUDIO_BASE_URL?: string;

	@IsOptional()
	@IsString()
	LMSTUDIO_MODEL?: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true })
	LLAMA_CPP_BASE_URL?: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true })
	OPENCODE_API_URL?: string;

	@IsOptional()
	@IsString()
	OPENCODE_API_KEY?: string;

	@IsOptional()
	@IsString()
	OPENROUTER_API_KEY?: string;

	@IsOptional()
	@IsString()
	OPENROUTER_MODEL?: string;

	@IsOptional()
	@IsString()
	TAVILY_API_KEY?: string;

	@IsOptional()
	@IsString()
	EXA_API_KEY?: string;

	@IsOptional()
	@IsString()
	BRAVE_API_KEY?: string;

	@IsOptional()
	@IsString()
	FIRECRAWL_API_KEY?: string;

	@IsOptional()
	@IsString()
	GOOGLE_API_KEY?: string;

	@IsOptional()
	@IsString()
	GOOGLE_CSE_ID?: string;

	@IsOptional()
	@IsString()
	REPLICATE_API_TOKEN?: string;
}

function resolveBlobToken(validated: EnvironmentVariables): void {
	const raw = validated.BLOB_READ_WRITE_TOKEN?.trim();
	const fallback = validated.VERCEL_BLOB_TOKEN?.trim();
	if ((!raw || raw.length === 0) && fallback && fallback.length > 0) {
		console.warn(
			"[env] VERCEL_BLOB_TOKEN is deprecated — use BLOB_READ_WRITE_TOKEN instead. Falling back to VERCEL_BLOB_TOKEN for now.",
		);
		validated.BLOB_READ_WRITE_TOKEN = fallback;
	} else if (
		raw &&
		raw.length > 0 &&
		fallback &&
		fallback.length > 0 &&
		raw !== fallback
	) {
		console.warn(
			"[env] Both BLOB_READ_WRITE_TOKEN and VERCEL_BLOB_TOKEN are set — using BLOB_READ_WRITE_TOKEN.",
		);
	}
}

export function validateEnv(
	config: Record<string, unknown>,
): EnvironmentVariables {
	const validated = plainToInstance(EnvironmentVariables, config, {
		enableImplicitConversion: true,
		exposeDefaultValues: true,
	});

	// This value shipped in .env.example before 2026-09-14. Anyone still running
	// it is signing sessions with a publicly known key.
	const KNOWN_COMPROMISED_SECRET =
		"MqQi8l6apIUPiyFinjGzRMGhQ4Hmhgki5c/KSO+D5Hw=";
	if (validated.BETTER_AUTH_SECRET === KNOWN_COMPROMISED_SECRET) {
		throw new Error(
			"BETTER_AUTH_SECRET is set to a value that was publicly committed in this repository's .env.example. Generate a new one with: openssl rand -base64 32",
		);
	}

	resolveBlobToken(validated);

	const errors = validateSync(validated, {
		skipMissingProperties: false,
		whitelist: false,
	});

	if (errors.length > 0) {
		const details = errors
			.map((error) => Object.values(error.constraints ?? {}).join(", "))
			.join("\n  - ");

		throw new Error(
			`Invalid environment configuration:\n  - ${details}\n\nSee .env.example at the root of the repo.`,
		);
	}

	return validated;
}
