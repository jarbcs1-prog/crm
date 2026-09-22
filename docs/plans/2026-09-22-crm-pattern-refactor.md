# Plan: CRM Pattern Refactor — P0/P1/P2

> **Goal:** Eliminate the 3 highest-leverage pattern violations (P0), then 3 high-value duplications (P1), then 2 scalability/hygiene items (P2). Every task is TDD, ≤5 min, independently committable. No behavior change without a failing test first.

## Architecture

```
apps/agent/agent/tools/
  tool-factory.ts          ← NEW: createCrmReadTool / createCallTool / defineTool
  *.ts (40+ files)         ← thin wrappers calling factory, no inline zod/tool() boilerplate

apps/api/src/trpc/
  trpc.ts                  ← AuthMiddleware built from TRPCModule.forRoot provider
  auth.middleware.ts       ← NEW: single global middleware, replaces per-procedure guards

apps/app/
  lib/proxy/
    createProxyRoute.ts    ← NEW: shared factory for catch-all proxy routes
  app/api/[...path]/route.ts        ← 3-line re-export via factory
  app/eve/v1/[...path]/route.ts    ← 3-line re-export via factory

apps/api/src/common/
  concurrency.ts           ← runLimited (already exists or new) — sole concurrency primitive
  errors.ts                ← TRPCError mapping, no silent .catch(()=>{})

apps/api/src/modules/{dashboard,conversations}/
  *.service.ts             ← Redis-backed cache OR documented single-instance constraint

apps/app/app/
  loading.tsx / Suspense boundaries
```

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Agent tools | `tool()` from `ai` SDK + `zod` schemas via factory | ai-sdk is already the runtime; factory removes 40× duplication |
| tRPC | `TRPCModule.forRoot({ middlewares: [authMiddleware] })` or `t.procedure.use(authMiddleware)` at router root | Single auth chokepoint; per-procedure guards are deleted |
| Proxy | `next/server` NextRequest/NextResponse + shared `createProxyRoute({ prefix, auth })` | DRY for two identical catch-all routes |
| Concurrency | `runLimited(items, limit, fn)` (p-limit style, 20 lines) | Replaces unbounded `Promise.all` that can fan-out 100+ DB/HTTP calls |
| Cache | `ioredis` if Redis available, else in-memory with `SINGLE_INSTANCE_ONLY` doc + startup warning | Dashboard/conversations TTL cache is per-process today |
| Errors | `TRPCError` only behind tRPC; never swallow with `.catch(()=>{})` | Unified error shape, no silent failures |

## Conventions

- **DRY** — extract on the 2nd duplication, not the 3rd.
- **YAGNI** — do not add Redis unless `REDIS_URL` is set; doc the constraint instead.
- **TDD** — each task starts with a failing test (`bun test` / `vitest`). No prod code before red.
- **Commits** — one commit per task, message `refactor(<scope>): <what>`.

---

## P0 — Must do first (highest leverage, blocks everything else)

### Task P0-1: Introduce `tool-factory.ts` — `defineTool` + `createCrmReadTool`

**Objective:** Centralize `tool({ description, inputSchema: z.object(...), execute })` + common CRM read plumbing.

**Files:**
- Create: `apps/agent/agent/tools/tool-factory.ts`
- Touch: `apps/agent/agent/tools/read_crm_history.ts` (first consumer, proves pattern)

**Step 1 — Failing test:**

Create `apps/agent/agent/tools/tool-factory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCrmReadTool } from "./tool-factory";
import { z } from "zod";

describe("createCrmReadTool", () => {
  it("builds a tool with description and zod schema and calls fetcher", async () => {
    const tool = createCrmReadTool({
      name: "read_crm_history",
      description: "Read CRM history",
      inputSchema: z.object({ contactId: z.string() }),
      fetch: async ({ contactId }, ctx) => ({ id: contactId, ctxOk: !!ctx.crm }),
    });
    expect(tool.description).toBeTruthy();
    // @ts-expect-error — execute is tool internals; assert via ai SDK shape
    const result = await tool.execute({ contactId: "c_1" }, { context: { crm: {} } } as any);
    expect(result).toEqual({ id: "c_1", ctxOk: true });
  });
});
```

**Step 2 — Run (expect FAIL):**

```bash
bunx vitest run apps/agent/agent/tools/tool-factory.test.ts
# Expected: FAIL — Cannot find module './tool-factory'
```

**Step 3 — Implementation:**

Create `apps/agent/agent/tools/tool-factory.ts`:

```ts
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
```

Keep `name` for registry/logging only; `ai.tool` does not need it (key in tools map provides it).

**Step 4 — Verify:**

```bash
bunx vitest run apps/agent/agent/tools/tool-factory.test.ts
# Expected: PASS (1 test)

bunx tsc --noEmit --project apps/agent/tsconfig.json
# Expected: no errors
```

**Step 5 — Commit:**

```bash
git add apps/agent/agent/tools/tool-factory.ts apps/agent/agent/tools/tool-factory.test.ts
git commit -m "refactor(agent-tools): introduce tool-factory (defineTool/createCrmReadTool)"
```

---

### Task P0-2: Migrate 3 representative tools to factory (prove breadth)

**Objective:** Migrate one CRM read, one call tool, one write tool.

**Files:**
- Modify: `apps/agent/agent/tools/read_crm_history.ts`, `apps/agent/agent/tools/make_call.ts`, `apps/agent/agent/tools/create_contact.ts`

**Step 1 — Failing test (characterization):**

Add to `apps/agent/agent/tools/migration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readCrmHistoryTool } from "./read_crm_history";
import { makeCallTool } from "./make_call";

describe("migrated tools keep shape", () => {
  it("read_crm_history still has description and inputSchema", () => {
    expect(readCrmHistoryTool.description).toBeTruthy();
    expect((readCrmHistoryTool as any).inputSchema).toBeTruthy();
  });
  it("make_call still has description", () => {
    expect(makeCallTool.description).toBeTruthy();
  });
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/agent/agent/tools/migration.test.ts
# Expected: FAIL — if tools not yet migrated or shape changed
```

**Step 3 — Implementation (example for `read_crm_history.ts`):**

Before:
```ts
export const readCrmHistoryTool = tool({ description: "...", inputSchema: z.object({...}), execute: async (...) => {...} });
```

After:
```ts
import { createCrmReadTool } from "./tool-factory";
import { z } from "zod";

export const readCrmHistoryTool = createCrmReadTool({
  name: "read_crm_history",
  description: "Read CRM history for a contact",
  inputSchema: z.object({ contactId: z.string() }),
  fetch: async ({ contactId }, ctx) => {
    // existing fetch logic
  },
});
```

Repeat for `make_call.ts` via `createCallTool`, `create_contact.ts` via `defineTool`.

**Step 4 — Verify:**

```bash
bunx vitest run apps/agent/agent/tools/migration.test.ts
bunx tsc --noEmit --project apps/agent/tsconfig.json
# Expected: PASS, no type errors
```

**Step 5 — Commit:**

```bash
git add apps/agent/agent/tools/read_crm_history.ts apps/agent/agent/tools/make_call.ts apps/agent/agent/tools/create_contact.ts apps/agent/agent/tools/migration.test.ts
git commit -m "refactor(agent-tools): migrate 3 tools to factory"
```

---

### Task P0-3: Bulk-migrate remaining ~37 tools

**Objective:** Mechanical migration; no logic change.

**Files:** All remaining `apps/agent/agent/tools/*.ts`

**Step 1 — Failing test:**

Extend `migration.test.ts` to loop over registry:

```ts
import * as tools from "./index"; // barrel that re-exports all tools

it("every tool has description + inputSchema", () => {
  for (const [name, t] of Object.entries(tools)) {
    expect((t as any).description, name).toBeTruthy();
    expect((t as any).inputSchema, name).toBeTruthy();
  }
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/agent/agent/tools/migration.test.ts
# Expected: FAIL on any tool missing shape after migration
```

**Step 3 — Implementation:** Apply same transform to each file; use a codemod or manual. Prefer script:

```bash
# optional helper — dry run
bun apps/agent/scripts/migrate-tools.ts --dry
bun apps/agent/scripts/migrate-tools.ts
```

Script should replace `tool({` with `defineTool({` / `createCrmReadTool({` based on heuristic (reads CRM → `createCrmReadTool`, uses call ctx → `createCallTool`).

**Step 4 — Verify:**

```bash
bunx vitest run apps/agent/agent/tools/
bunx tsc --noEmit --project apps/agent/tsconfig.json
# Expected: all PASS
```

**Step 5 — Commit:**

```bash
git add apps/agent/agent/tools/
git commit -m "refactor(agent-tools): bulk migrate remaining tools to factory"
```

---

### Task P0-4: Global AuthMiddleware in TRPCModule.forRoot

**Objective:** One auth chokepoint; delete per-procedure guards.

**Files:**
- Create: `apps/api/src/trpc/auth.middleware.ts`
- Modify: `apps/api/src/trpc/trpc.ts` (or `apps/api/src/trpc/index.ts` / `apps/api/src/app.module.ts` where `TRPCModule.forRoot` lives)
- Modify: any `*.router.ts` that currently does `t.procedure.use(isAuthed)` inline

**Step 1 — Failing test:**

Create `apps/api/src/trpc/auth.middleware.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authMiddleware } from "./auth.middleware";
import { TRPCError } from "@trpc/server";

describe("authMiddleware", () => {
  it("throws UNAUTHORIZED when no user in ctx", async () => {
    const next = async () => ({} as any);
    await expect(authMiddleware({ ctx: {} as any, next } as any)).rejects.toBeInstanceOf(TRPCError);
  });
  it("calls next when user present", async () => {
    const next = vi.fn(async () => "ok");
    await authMiddleware({ ctx: { user: { id: "u1" } } as any, next } as any);
    expect(next).toHaveBeenCalled();
  });
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/api/src/trpc/auth.middleware.test.ts
# Expected: FAIL — module not found
```

**Step 3 — Implementation:**

`apps/api/src/trpc/auth.middleware.ts`:

```ts
import { TRPCError } from "@trpc/server";

export const authMiddleware = async ({ ctx, next }: any) => {
  if (!ctx?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx });
};

export const publicProcedure = (t: any) => t.procedure;
export const protectedProcedure = (t: any) => t.procedure.use(authMiddleware);
```

Wire globally — choose one (prefer global + opt-out for public):

In `apps/api/src/trpc/trpc.ts` or `app.module.ts`:

```ts
import { authMiddleware } from "./trpc/auth.middleware";

// Option A: TRPCModule.forRoot with global middleware (if using trpc-nestjs)
TRPCModule.forRoot({
  autoSchemaFile: "schema.gql",
  context: ({ req }) => ({ user: req.user }),
  middlewares: [authMiddleware], // global
});

// Option B: tRPC vanilla — create protectedProcedure and use it everywhere
// export const protectedProcedure = t.procedure.use(authMiddleware);
// Then replace all `t.procedure` with `protectedProcedure` except public routes.
```

Mark public routes explicitly: `t.procedure` (unauthenticated) vs `protectedProcedure`.

**Step 4 — Verify:**

```bash
bunx vitest run apps/api/src/trpc/auth.middleware.test.ts
# Expected: PASS

bunx tsc --noEmit --project apps/api/tsconfig.json
# Expected: no errors
```

**Step 5 — Commit:**

```bash
git add apps/api/src/trpc/auth.middleware.ts apps/api/src/trpc/trpc.ts apps/api/src/app.module.ts
git commit -m "refactor(trpc): global AuthMiddleware via TRPCModule.forRoot"
```

---

### Task P0-5: Delete per-procedure auth guards (cleanup)

**Objective:** Remove duplicated `if (!ctx.user) throw` / `.use(isAuthed)` scattered in routers.

**Files:** `apps/api/src/**/*.router.ts`, `apps/api/src/**/*.controller.ts`

**Step 1 — Failing test (lint rule):**

Add a temporary test that greps for leftover guards:

```ts
import { execSync } from "node:child_process";
it("no per-procedure auth guards remain", () => {
  const hits = execSync(`grep -r "UNAUTHORIZED" apps/api/src --include="*.ts" | grep -v auth.middleware | wc -l`, { encoding: "utf8" });
  expect(Number(hits.trim())).toBe(0);
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/api/src/trpc/no-per-procedure-guard.test.ts
# Expected: FAIL — hits > 0
```

**Step 3 — Implementation:** Delete per-procedure guards; switch routers to `protectedProcedure`.

**Step 4 — Verify:**

```bash
bunx vitest run apps/api/src/trpc/no-per-procedure-guard.test.ts
# Expected: PASS (remove test after, or keep as guard)
```

**Step 5 — Commit:**

```bash
git commit -m "refactor(trpc): remove per-procedure auth guards"
```

---

## P1 — High value, after P0

### Task P1-1: Shared `createProxyRoute` factory

**Objective:** Deduplicate `apps/app/app/api/[...path]/route.ts` and `apps/app/app/eve/v1/[...path]/route.ts`.

**Files:**
- Create: `apps/app/lib/proxy/createProxyRoute.ts`
- Modify: `apps/app/app/api/[...path]/route.ts`, `apps/app/app/eve/v1/[...path]/route.ts`

**Step 1 — Failing test:**

Create `apps/app/lib/proxy/createProxyRoute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createProxyRoute } from "./createProxyRoute";

describe("createProxyRoute", () => {
  it("returns handlers for GET/POST", () => {
    const handlers = createProxyRoute({ targetBaseUrl: "http://localhost:3001" });
    expect(handlers.GET).toBeTypeOf("function");
    expect(handlers.POST).toBeTypeOf("function");
  });
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/app/lib/proxy/createProxyRoute.test.ts
# Expected: FAIL — module not found
```

**Step 3 — Implementation:**

`apps/app/lib/proxy/createProxyRoute.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export function createProxyRoute(opts: {
  targetBaseUrl: string;
  prefixToStrip?: string;
  methods?: string[];
}) {
  const handler = async (req: NextRequest, { params }: { params: { path?: string[] } }) => {
    const path = params.path?.join("/") ?? "";
    const url = new URL(`${opts.targetBaseUrl}/${path}`);
    url.search = new URL(req.url).search;
    const res = await fetch(url.toString(), {
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
    });
    return new NextResponse(res.body, { status: res.status, headers: res.headers });
  };
  const methods = opts.methods ?? ["GET","POST","PUT","PATCH","DELETE"];
  return Object.fromEntries(methods.map(m => [m, handler])) as Record<string, typeof handler> & { GET: typeof handler; POST: typeof handler };
}
```

Consumers become:

`apps/app/app/api/[...path]/route.ts`:

```ts
import { createProxyRoute } from "@/lib/proxy/createProxyRoute";
const h = createProxyRoute({ targetBaseUrl: process.env.API_URL! });
export const { GET, POST, PUT, PATCH, DELETE } = h;
```

Same for `apps/app/app/eve/v1/[...path]/route.ts` with different `targetBaseUrl`.

**Step 4 — Verify:**

```bash
bunx vitest run apps/app/lib/proxy/createProxyRoute.test.ts
bunx tsc --noEmit --project apps/app/tsconfig.json
# Expected: PASS
```

**Step 5 — Commit:**

```bash
git add apps/app/lib/proxy/createProxyRoute.ts apps/app/app/api/[...path]/route.ts apps/app/app/eve/v1/[...path]/route.ts
git commit -m "refactor(proxy): shared createProxyRoute factory"
```

---

### Task P1-2: Unify error handling to TRPCError behind tRPC

**Objective:** All tRPC errors throw `TRPCError`; no raw `Error` leaking, no swallowed errors.

**Files:**
- Create/Modify: `apps/api/src/common/errors.ts` (or `apps/api/src/trpc/errors.ts`)
- Modify: `apps/api/src/**/*.service.ts`, `apps/api/src/**/*.router.ts`

**Step 1 — Failing test:**

Create `apps/api/src/common/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toTRPCError } from "./errors";
import { TRPCError } from "@trpc/server";

describe("toTRPCError", () => {
  it("maps NOT_FOUND", () => {
    expect(toTRPCError(new Error("not found"), "NOT_FOUND")).toBeInstanceOf(TRPCError);
  });
  it("preserves TRPCError as-is", () => {
    const e = new TRPCError({ code: "BAD_REQUEST" });
    expect(toTRPCError(e)).toBe(e);
  });
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/api/src/common/errors.test.ts
# Expected: FAIL — module not found
```

**Step 3 — Implementation:**

`apps/api/src/common/errors.ts`:

```ts
import { TRPCError } from "@trpc/server";

export function toTRPCError(err: unknown, fallbackCode: any = "INTERNAL_SERVER_ERROR"): TRPCError {
  if (err instanceof TRPCError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new TRPCError({ code: fallbackCode, message });
}

export function assertFound<T>(value: T | null | undefined, message = "Not found"): T {
  if (value == null) throw new TRPCError({ code: "NOT_FOUND", message });
  return value;
}
```

Replace `throw new Error(...)` inside tRPC procedures with `throw new TRPCError(...)` or `toTRPCError`.

**Step 4 — Verify:**

```bash
bunx vitest run apps/api/src/common/errors.test.ts
# grep for remaining raw throws inside trpc routers — should be 0
grep -rn "throw new Error" apps/api/src --include="*.ts" | grep -i trpc || echo "clean"
# Expected: clean or only non-trpc paths
```

**Step 5 — Commit:**

```bash
git add apps/api/src/common/errors.ts
git commit -m "refactor(errors): unify to TRPCError behind tRPC"
```

---

### Task P1-3: Audit and fix silent `.catch(()=>{})`

**Objective:** No silent swallowing; every catch logs or maps to TRPCError.

**Files:** All `*.ts` matching `\.catch\(\(\)` or `\.catch\(\(\) =>` or `catch {}` empty.

**Step 1 — Failing test (grep gate):**

Create `apps/api/src/common/no-silent-catch.test.ts`:

```ts
import { execSync } from "node:child_process";
it("no silent .catch(()=>{})", () => {
  const out = execSync(`grep -rn "\\.catch" apps --include="*.ts" | grep -E "\\(\\) *=> *\\{\\}" | wc -l`, { encoding: "utf8" });
  expect(Number(out.trim())).toBe(0);
});
```

Adjust pattern to match repo reality: `grep -rn "\.catch" apps --include="*.ts"`.

**Step 2 — Run:**

```bash
bunx vitest run apps/api/src/common/no-silent-catch.test.ts
# Expected: FAIL — count > 0
```

**Step 3 — Implementation:** For each hit, replace:

```ts
// Before
promise.catch(() => {})
// After
promise.catch((err) => { logger.warn({ err }, "ignored error"); })
// or if inside tRPC:
promise.catch((err) => { throw toTRPCError(err); })
```

If intentionally ignored, require comment + log: `// intentionally ignored: <reason>`.

**Step 4 — Verify:**

```bash
bunx vitest run apps/api/src/common/no-silent-catch.test.ts
# Expected: PASS
```

**Step 5 — Commit:**

```bash
git commit -m "refactor(errors): audit silent catches, add logging"
```

---

### Task P1-4: Enforce `runLimited` everywhere (replace unbounded `Promise.all`)

**Objective:** Single concurrency primitive; no unbounded fan-out.

**Files:**
- Create: `apps/api/src/common/concurrency.ts` (if not exists)
- Modify: every file with `Promise.all(` that fans out over user-controlled arrays (DB writes, HTTP calls, tool calls)

**Step 1 — Failing test:**

Create `apps/api/src/common/concurrency.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runLimited } from "./concurrency";

describe("runLimited", () => {
  it("limits concurrency", async () => {
    let concurrent = 0, max = 0;
    await runLimited([1,2,3,4,5], 2, async () => {
      concurrent++; max = Math.max(max, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
    });
    expect(max).toBe(2);
  });
  it("preserves order", async () => {
    const out = await runLimited([1,2,3], 2, async (n) => n * 2);
    expect(out).toEqual([2,4,6]);
  });
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/api/src/common/concurrency.test.ts
# Expected: FAIL — module not found
```

**Step 3 — Implementation:**

`apps/api/src/common/concurrency.ts`:

```ts
export async function runLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit <= 0) throw new Error("limit must be > 0");
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
```

Replace patterns:

```ts
// Before
await Promise.all(contacts.map(c => enrich(c)));
// After
await runLimited(contacts, 5, c => enrich(c));
```

Choose limit per call site: DB writes 5–10, external HTTP 5, internal trivial 20. Document in comment.

Optional lint guard: `no-restricted-syntax` for `Promise.all` with `.map(` argument — warn, not error.

**Step 4 — Verify:**

```bash
bunx vitest run apps/api/src/common/concurrency.test.ts
grep -rn "Promise\.all" apps --include="*.ts" | grep "\.map" | head
# Expected: 0 or only justified with // allow: bounded (n<=5)
```

**Step 5 — Commit:**

```bash
git add apps/api/src/common/concurrency.ts
git commit -m "refactor(concurrency): enforce runLimited, replace unbounded Promise.all"
```

---

## P2 — Scalability / hygiene (after P1)

### Task P2-1: ttl-cache → Redis or document single-instance constraint

**Objective:** Make cache correctness explicit; do not silently break when scaling to 2 replicas.

**Files:**
- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts`, `apps/api/src/modules/conversations/conversations.service.ts` (or wherever `ttl-cache` / `Map` + `setTimeout` cache lives)
- Create: `apps/api/src/common/cache.ts` (abstraction)

**Step 1 — Failing test:**

Create `apps/api/src/common/cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCache } from "./cache";

describe("createCache", () => {
  it("get/set with ttl", async () => {
    const c = createCache({ ttlMs: 50 });
    await c.set("k", "v");
    expect(await c.get("k")).toBe("v");
    await new Promise(r => setTimeout(r, 60));
    expect(await c.get("k")).toBeUndefined();
  });
});
```

**Step 2 — Run:**

```bash
bunx vitest run apps/api/src/common/cache.test.ts
# Expected: FAIL — module not found
```

**Step 3 — Implementation:**

`apps/api/src/common/cache.ts`:

```ts
type Cache = { get(key: string): Promise<string | undefined>; set(key: string, value: string, ttlMs?: number): Promise<void> };

export function createCache(opts: { ttlMs: number; redisUrl?: string }): Cache {
  if (opts.redisUrl) {
    const Redis = require("ioredis");
    const redis = new Redis(opts.redisUrl);
    return {
      get: (k) => redis.get(k).then((v: string | null) => v ?? undefined),
      set: (k, v, ttlMs) => redis.set(k, v, "PX", ttlMs ?? opts.ttlMs).then(() => {}),
    };
  }
  if (process.env.NODE_ENV === "production") {
    console.warn("[cache] SINGLE_INSTANCE_ONLY: using in-memory ttl-cache; set REDIS_URL to share across replicas");
  }
  const store = new Map<string, { v: string; exp: number }>();
  return {
    get: async (k) => {
      const e = store.get(k);
      if (!e || Date.now() > e.exp) { store.delete(k); return undefined; }
      return e.v;
    },
    set: async (k, v, ttlMs) => { store.set(k, { v, exp: Date.now() + (ttlMs ?? opts.ttlMs) }); },
  };
}
```

If `REDIS_URL` is set, use Redis. Else, keep in-memory but add startup warning + docs in `docs/environment.md` and `.env.example`:

```
REDIS_URL= # optional — if unset, dashboard/conversations cache is per-process (single instance only)
```

Update services to inject `createCache({ ttlMs: 60_000, redisUrl: process.env.REDIS_URL })`.

**Step 4 — Verify:**

```bash
bunx vitest run apps/api/src/common/cache.test.ts
bunx tsc --noEmit --project apps/api/tsconfig.json
# Expected: PASS
```

**Step 5 — Commit:**

```bash
git add apps/api/src/common/cache.ts apps/api/src/modules/dashboard/ apps/api/src/modules/conversations/ .env.example docs/environment.md
git commit -m "refactor(cache): Redis-backed cache or documented single-instance constraint"
```

---

### Task P2-2: Add `loading.tsx` / Suspense boundaries (audit silent catches follow-up)

**Objective:** No blank-screen waterfalls; every async server component has a loading state.

**Files:**
- Create: `apps/app/app/loading.tsx`, `apps/app/app/(dashboard)/loading.tsx` (or per-route where data fetching occurs)
- Modify: async page components to wrap client islands in `<Suspense>`

**Step 1 — Failing test (presence check):**

Create `apps/app/lib/loading-guard.test.ts`:

```ts
import { existsSync } from "node:fs";
import { expect, it } from "vitest";
it("root loading.tsx exists", () => { expect(existsSync("apps/app/app/loading.tsx")).toBe(true); });
```

**Step 2 — Run:**

```bash
bunx vitest run apps/app/lib/loading-guard.test.ts
# Expected: FAIL — file not found
```

**Step 3 — Implementation:**

`apps/app/app/loading.tsx`:

```tsx
export default function Loading() {
  return <div className="animate-pulse p-8">Loading…</div>;
}
```

For pages with heavy data, wrap:

```tsx
import { Suspense } from "react";
export default function Page() {
  return <Suspense fallback={<Loading />}><DashboardContent /></Suspense>;
}
```

**Step 4 — Verify:**

```bash
bunx vitest run apps/app/lib/loading-guard.test.ts
bun run build 2>&1 | tail -20
# Expected: PASS, build succeeds
```

**Step 5 — Commit:**

```bash
git add apps/app/app/loading.tsx
git commit -m "feat(app): add loading.tsx/Suspense boundaries"
```

---

## Execution Order & Dependencies

```
P0-1 → P0-2 → P0-3  (factory chain)
P0-4 → P0-5         (auth chain)
P0*  → P1-1, P1-2, P1-3, P1-4  (P1 can run in parallel after P0)
P1*  → P2-1, P2-2            (P2 after P1)
```

Suggested batching: land P0 in one PR, P1 in second, P2 in third — or one PR per task if CI is fast.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| 40-file churn conflicts | Do P0-1/P0-2 first, then bulk codemod in single commit; freeze tools dir during. |
| Global auth breaks public routes | Keep `t.procedure` for public; add integration test for `/health` / public queries. |
| Proxy factory drops headers | Copy existing proxy tests; add header-forwarding assertion. |
| runLimited changes semantics (order/errors) | Preserve `Promise.all` order + fail-fast (first rejection rejects). Test both. |
| Redis not available in dev | In-memory fallback + warning; no hard dependency. |

## Definition of Done

- [ ] `bunx tsc --noEmit` passes for `apps/agent`, `apps/api`, `apps/app`
- [ ] `bunx vitest run` passes (no skipped new tests)
- [ ] `grep -rn "\.catch.*=>.*{}" apps` returns 0
- [ ] `grep -rn "Promise\.all" apps --include="*.ts" | grep "\.map"` is 0 or allow-listed
- [ ] No per-procedure `UNAUTHORIZED` outside `auth.middleware.ts`
- [ ] `.env.example` documents `REDIS_URL` (optional)
