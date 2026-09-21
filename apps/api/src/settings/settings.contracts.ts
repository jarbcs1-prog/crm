import { z } from "zod";

export interface LocalProvider {
	name: string;
	endpoint: string;
	modelId: string | null;
}

export const setAgentModelInput = z.object({
	modelId: z.string().trim().min(1).max(200).nullable(),
});

export type SetAgentModelInput = z.infer<typeof setAgentModelInput>;
