import { VOICE_PROVIDERS } from "@crm/db/settings";
import { z } from "zod";

export interface LocalProvider {
	name: string;
	endpoint: string;
	modelId: string | null;
}

export const setAgentModelInput = z.object({
	modelId: z.string().trim().min(1).max(200).nullable(),
});

export const setVoiceProviderInput = z.object({
	provider: z.enum(VOICE_PROVIDERS).nullable(),
});

export type SetAgentModelInput = z.infer<typeof setAgentModelInput>;
