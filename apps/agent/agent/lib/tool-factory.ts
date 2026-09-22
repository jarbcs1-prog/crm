import type { z } from "zod";

type Ctx = { crm?: unknown; call?: unknown; [k: string]: unknown };

type ToolDef<T extends z.ZodTypeAny> = {
  description: string;
  inputSchema: T;
  execute: (input: z.infer<T>, ctx: Ctx) => Promise<unknown>;
  [k: string]: unknown;
};

export function defineTool<T extends z.ZodTypeAny>(opts: ToolDef<T>) {
  return {
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: (input: z.infer<T>, ctx: Ctx) => opts.execute(input, ctx),
  };
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

export function createCallTool<T extends z.ZodTypeAny>(opts: ToolDef<T>) {
  return defineTool(opts);
}
