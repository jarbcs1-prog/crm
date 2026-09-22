import { tool } from "ai";
import { z } from "zod";

type Ctx = { crm?: unknown; call?: unknown; [k: string]: unknown };

export function defineTool<T extends z.ZodTypeAny>(opts: {
  description: string;
  inputSchema: T;
  execute: (input: z.infer<T>, ctx: Ctx) => Promise<unknown>;
}) {
  return tool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: async (input, { context }: any) => opts.execute(input, context as Ctx),
  });
}

export function createCrmReadTool<T extends z.ZodTypeAny>(opts: {
  name: string;
  description: string;
  inputSchema: T;
  fetch: (input: z.infer<T>, ctx: Ctx) => Promise<unknown>;
}) {
  return defineTool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: (input, ctx) => opts.fetch(input, ctx),
  });
}

export function createCallTool<T extends z.ZodTypeAny>(opts: {
  description: string;
  inputSchema: T;
  execute: (input: z.infer<T>, ctx: Ctx) => Promise<unknown>;
}) {
  return defineTool(opts);
}
