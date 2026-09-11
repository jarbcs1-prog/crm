# Code Generation and Client Usage

Contents:
- [What the CLI does](#what-the-cli-does)
- [Commands and flags](#commands-and-flags)
- [Wiring codegen into your scripts](#wiring-codegen-into-your-scripts)
- [ESM and `--import-extension`](#esm-and---import-extension)
- [When schema flattening fails](#when-schema-flattening-fails)
- [Consuming `AppRouter` on the client](#consuming-approuter-on-the-client)
- [Sharing the type across a monorepo](#sharing-the-type-across-a-monorepo)
- [`AppRouterHost`](#approuterhost)
- [E2E testing with AppRouterHost](#e2e-testing-with-approuterhost)
- [trpc-ui and other integrations](#trpc-ui-and-other-integrations)

## What the CLI does

`nestjs-trpc` ships a Rust binary (since v2.0.1) that statically analyses your source,
finds classes decorated with `@Router`, reads their `@Query`/`@Mutation`/`@Subscription`
decorators, inlines the referenced Zod schemas and writes a `server.ts` ending in:

```typescript
export type AppRouter = typeof appRouter;
```

That file is **types only**. Nothing in it executes at runtime — your procedures still run
through the Nest-managed router. Its only job is to give the client something to infer
against.

Two consequences follow from it being static analysis rather than reflection:

- The CLI never boots your app. It doesn't need a database, environment variables or a
  successful `NestFactory.create()`.
- It only sees what it can read literally. A schema assembled by a function call at runtime,
  or a router registered dynamically, is invisible to it.

The generator locates your entrypoint automatically — checking `package.json` `source`/`main`
fields, then `src/main.ts`, `src/app.module.ts`, `lib/main.ts`, `lib/app.module.ts`,
`app.module.ts`, `main.module.ts` — and reads configuration out of the `TRPCModule.forRoot()`
call it finds. It also invokes `tsc --noEmit` to typecheck the result, so **`tsc` must be
resolvable** or generation fails with "TypeScript compiler (tsc) not found."

## Commands and flags

```shell
npx nestjs-trpc generate      # one-shot generation
npx nestjs-trpc watch         # regenerate on file change
npx nestjs-trpc --version
```

`generate` options:

| Flag | Purpose |
|---|---|
| `-e, --entrypoint <PATH>` | Path to the Nest module entrypoint. Auto-discovered if omitted. |
| `-r, --router-pattern <PATTERN>` | Glob for locating router files. |
| `-o, --output <PATH>` | Output directory. Default `./src/@generated`. |
| `--import-extension <js\|none\|auto>` | Whether to append `.js` to local imports. Default `auto`. |
| `--dry-run` | Validate and report without writing. |
| `--json` | Machine-readable output, for tooling and CI. |
| `-v`, `-vv`, `-vvv` | Increasing verbosity (info, debug, trace). |
| `--debug` | Full debug output with file locations, for bug reports. |

Use `-vv` when generation succeeds but a procedure is missing — the debug log names each
router file it found and each procedure it extracted, which usually identifies the one it
skipped.

## Wiring codegen into your scripts

The generated type is a build artifact that can silently go stale. Make that impossible:

```json
{
  "scripts": {
    "dev": "nestjs-trpc watch & nest start --watch",
    "build": "nestjs-trpc generate && nest build",
    "typecheck:trpc": "nestjs-trpc generate --dry-run --json"
  }
}
```

Whether you commit `src/@generated` is a real decision, not a detail:

- **Commit it** if the frontend is a separate repo or if anything consumes the types
  without running the backend's build. The cost is merge conflicts on the generated file.
- **Gitignore it** if everything lives in one repo and the build always regenerates. Then
  add `nestjs-trpc generate --dry-run` to CI so a PR that changes a router without
  regenerating still fails loudly.

Pick one and be consistent — the failure mode of "sometimes committed" is a client typed
against a router that no longer exists, which typechecks fine and 404s at runtime.

## ESM and `--import-extension`

Node ESM requires explicit `.js` extensions on relative imports. The default `auto` reads
your nearest `tsconfig.json` and enables extensions when `module` or `moduleResolution` is
`NodeNext`/`Node16`.

There's a documented gap: projects on `moduleResolution: bundler` (e.g.
`module: ESNext` + `moduleResolution: bundler`) that nonetheless run on plain Node ESM
**still need the extensions at runtime**, but `auto` reports `false` because bundler mode
doesn't require them at compile time. The symptom is `ERR_MODULE_NOT_FOUND` at startup with
everything typechecking cleanly. Fix it explicitly:

```shell
npx nestjs-trpc generate --import-extension=js
```

CommonJS projects want `none`, which `auto` will infer correctly.

## When schema flattening fails

The generator inlines your Zod schemas into `server.ts`. When a schema references something
it can't inline, it tries to add a relative import instead. That resolution can fail —
typically for schemas from an external package, behind a path alias or built by a helper
function.

Signals: "Maximum recursion depth reached during schema flattening", an unresolved import in
the generated file or a procedure typed as `any`.

Fixes, in order of preference:

1. **Define schemas as top-level `const`s in files the CLI scans** and import them into the
   router by relative path. This is the path the tool is designed for.
2. **Avoid runtime-computed schemas** in decorators. `input: makeSchema(opts)` cannot be
   read statically; `input: z.object({ ... })` or a reference to a module-scope const can.
3. **Watch recursion.** Deeply self-referential Zod schemas (`z.lazy` trees) can blow the
   flattening depth limit. Break the cycle by extracting a sub-schema.
4. Use `-vv` to see exactly which schema it choked on.

Zod 4 is supported (since v2.9.0), as is Zod 3. Other Standard Schema validators satisfy the
`Parser` type at compile time, but the flattening logic is Zod-oriented — expect rougher
edges elsewhere.

## Consuming `AppRouter` on the client

Import the generated type — and only the type:

```typescript
import type { AppRouter } from '../../server/src/@generated/server';
```

**Vanilla client:**

```typescript
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './generated/server';

const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:8080/trpc' })],
});

const user = await trpc.users.getUserById.query({ userId: '1' });
const created = await trpc.users.createUser.mutate({ name: 'Jane' });
```

The `users` segment is the router's `alias`. The `url` must match `basePath` plus any Nest
global prefix.

**React Query:** https://trpc.io/docs/client/react
**Next.js:** https://trpc.io/docs/client/nextjs
**Vanilla:** https://trpc.io/docs/client/vanilla

If you configured a `transformer` on the module, configure the identical one on the client.

For subscriptions, the client needs a link that can stream — `httpSubscriptionLink` for SSE,
usually combined with `splitLink` so only subscriptions take that path.

Import with `import type`, not a plain `import`. A value import of a server-side file will
drag server code into the client bundle and in a monorepo that's how database drivers end
up in browser builds.

## Sharing the type across a monorepo

In a Turborepo/pnpm-workspaces setup, point the CLI's output at a shared package:

```shell
nestjs-trpc generate --output ../../packages/api-types/src
```

Then have the frontend depend on `@repo/api-types` and re-export `AppRouter` from its index.
This beats deep relative paths into the backend's `src`, because it keeps the dependency
explicit in `package.json` and lets the type-generation step be a proper task in the
dependency graph:

```json
{
  "tasks": {
    "generate:trpc": { "outputs": ["../../packages/api-types/src/**"] },
    "build": { "dependsOn": ["^build", "generate:trpc"] }
  }
}
```

## `AppRouterHost`

For runtime access to the actual `appRouter` object:

```typescript
export declare class AppRouterHost {
  set appRouter(schemaRef: AnyRouter);
  get appRouter(): AnyRouter;
}
```

```typescript
const { appRouter } = app.get(AppRouterHost);
```

The getter throws if read before the app is initialised. The router is assembled during
`onModuleInit`, so call it after `app.listen()` or `app.init()` — or from your own
`onModuleInit`, which is what the trpc-ui controller below does.

## E2E testing with AppRouterHost

`AppRouterHost` gives you the real router, so you can exercise the full pipeline —
validation, middlewares, context — without HTTP:

```typescript
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = moduleRef.createNestApplication();
await app.init();                       // required before reading appRouter

const { appRouter } = app.get(AppRouterHost);
const caller = appRouter.createCaller({ auth: { userId: 'test-user' } });

const user = await caller.users.getUserById({ userId: '1' });
```

The object you pass to `createCaller` replaces your context class's output, so it must
satisfy whatever your middlewares and procedures read off `ctx`. That's the trade: you skip
the transport, but you take responsibility for constructing a realistic context. If your
context is split inner/outer, reuse the inner one here.

## trpc-ui and other integrations

Anything that accepts a vanilla tRPC router works — `trpc-ui`, `trpc-openapi`,
`trpc-playground`. Get the router from `AppRouterHost` and hand it over.

```shell
npm install trpc-ui
```

```typescript
// trpc-panel.controller.ts
import { All, Controller, Inject, OnModuleInit } from '@nestjs/common';
import { renderTrpcPanel } from 'trpc-ui';
import { AnyRouter } from '@trpc/server';
import { AppRouterHost } from 'nestjs-trpc';

@Controller()
export class TrpcPanelController implements OnModuleInit {
  private appRouter!: AnyRouter;

  constructor(
    @Inject(AppRouterHost) private readonly appRouterHost: AppRouterHost,
  ) {}

  onModuleInit() {
    this.appRouter = this.appRouterHost.appRouter;
  }

  @All('/panel')
  panel(): string {
    return renderTrpcPanel(this.appRouter, { url: 'http://localhost:8080/trpc' });
  }
}
```

```typescript
@Module({
  imports: [TRPCModule.forRoot({ context: AppContext })],
  controllers: [TrpcPanelController],
})
export class AppModule {}
```

Reading `appRouter` in `onModuleInit` rather than the constructor is what keeps this legal —
the router doesn't exist yet at construction time.

The panel then serves at `/panel`. It exposes your entire API surface with a call interface,
so gate it behind an environment check before this reaches production:

```typescript
controllers: process.env.NODE_ENV !== 'production' ? [TrpcPanelController] : [],
```
