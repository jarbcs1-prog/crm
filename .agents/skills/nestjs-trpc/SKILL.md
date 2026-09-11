---
name: nestjs-trpc
description: Build end-to-end type-safe tRPC APIs inside NestJS using the nestjs-trpc adapter — @Router/@Query/@Mutation/@Subscription decorators, TRPCModule.forRoot, injectable middlewares and context, Zod input/output schemas and the Rust CLI that generates the AppRouter type for clients. Use this skill whenever the user mentions nestjs-trpc, tRPC in a NestJS app, @Router or @Query decorators, TRPCModule, AppRouterHost, "typed API between my Nest backend and frontend", generating AppRouter types or is migrating a NestJS GraphQL/REST API to tRPC — even if they don't name the library explicitly.
license: MIT
metadata:
  version: "1.0.0"
  targets: "nestjs-trpc v2.x (verified against 2.13.0)"
  docs: "https://nestjs-trpc.io/docs"
---

# NestJS-tRPC

`nestjs-trpc` lets you define tRPC procedures as decorated NestJS classes instead of
chaining `t.procedure` builders. Routers are DI-aware classes that look like controllers;
a separate CLI reads those decorators and emits an `AppRouter` type for the client.

**Verified against v2.13.0.** The published docs at nestjs-trpc.io still contain v1-era
examples in several places. Where this skill and the docs disagree, this skill matches the
shipped `.d.ts` files and the official `examples/` in the repo — see
[Docs errata](#docs-errata) for the specific traps.

## The one thing to internalize

There are **two separate systems** that both need to be correct and they fail
independently:

| | Runtime | Type generation |
|---|---|---|
| Driven by | Nest DI container at boot | Rust CLI doing static analysis of your source |
| Needs | classes listed in `providers` | decorators it can read literally |
| Fails as | 404 / "no procedures" / undefined injection | stale or missing `AppRouter` |

A router that works at runtime but was never picked up by the CLI produces a client with no
types and vice versa. When something is wrong, first ask *which of the two* is broken.

## Setup workflow

### 1. Install

```shell
npm install nestjs-trpc zod @trpc/server
```

Peer deps (v2.13.0): `@nestjs/common` & `@nestjs/core` ^9.3.8 || ^10 || ^11,
`@trpc/server` ^11, `zod` ^3.14 || ^4, `rxjs` 7.8.1, `reflect-metadata` ^0.1.13 || ^0.2.
tRPC **v11 is required** — v10 will not work.

Standard NestJS `tsconfig.json` requirements apply: `experimentalDecorators: true`,
`emitDecoratorMetadata: true`. `tsc` must be resolvable, because the CLI shells out to it
to typecheck what it generates.

### 2. Register the module

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TRPCModule } from 'nestjs-trpc';
import { UserRouter } from './user.router';
import { UserService } from './user.service';
import { ProtectedMiddleware } from './protected.middleware';
import { AppContext } from './app.context';

@Module({
  imports: [
    TRPCModule.forRoot({
      context: AppContext,
    }),
  ],
  providers: [UserRouter, AppContext, UserService, ProtectedMiddleware],
})
export class AppModule {}
```

Routers, middlewares and the context class are all **ordinary providers**. Listing them in
`providers` is what makes DI work — forgetting a router here is the single most common
reason procedures silently don't exist at runtime.

Default mount point is `/trpc`; override with `basePath`. Full option table in
[references/module-config.md](references/module-config.md).

### 3. Write a router

```typescript
// user.router.ts
import { Inject } from '@nestjs/common';
import { Router, Query, Mutation, UseMiddlewares, Input, Ctx } from 'nestjs-trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { UserService } from './user.service';
import { ProtectedMiddleware } from './protected.middleware';
import { userSchema, type User } from './user.schema';

@Router({ alias: 'users' })
export class UserRouter {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Query({
    input: z.object({ userId: z.string() }),
    output: userSchema,
  })
  @UseMiddlewares(ProtectedMiddleware)
  async getUserById(@Input('userId') userId: string): Promise<User> {
    const user = await this.userService.getUser(userId);

    if (user == null) {
      throw new TRPCError({ message: 'Could not find user.', code: 'NOT_FOUND' });
    }

    return user;
  }
}
```

Client call site: `trpc.users.getUserById.query({ userId })`. The `alias` sets that first
segment — without it the class name is used.

### 4. Generate the client type

```shell
npx nestjs-trpc generate      # one-shot
npx nestjs-trpc watch         # regenerate on change during development
```

Writes `server.ts` (containing `export type AppRouter = typeof appRouter`) to
`./src/@generated` by default; `--output <dir>` moves it. This is a **build step, not a
runtime import** — the generated file is types only and your procedures still execute
through the Nest-managed router at runtime.

Add it to your scripts so it can't drift:

```json
{
  "scripts": {
    "dev": "nestjs-trpc watch & nest start --watch",
    "build": "nestjs-trpc generate && nest build"
  }
}
```

Run `nestjs-trpc generate --dry-run` in CI to fail the build when the committed types are
stale.

## Writing procedures

Three procedure decorators, all taking `{ input?, output?, meta? }`, all optional:

| Decorator | tRPC equivalent |
|---|---|
| `@Query()` | `publicProcedure.query()` |
| `@Mutation()` | `publicProcedure.mutation()` |
| `@Subscription()` | `publicProcedure.subscription()` |

`input` validates and types the incoming payload. `output` is optional — omit it and the
return type is inferred from the method signature (since v2.11.0). Prefer an explicit
`output` on anything crossing a trust boundary, because it strips fields the client
shouldn't see; a leaked `password` column is the classic version of this bug. Note the
example schema above deliberately keeps `password` in `userSchema` only to mirror the
upstream docs — in real code, define a separate public-facing schema.

Any Standard Schema validator works (Zod, Valibot, ArkType, Yup, Superstruct), but **the
CLI's schema flattening is built around Zod** — stay on Zod unless you have a reason not to.

Parameter decorators pull pieces out of the tRPC `opts` object:

| Decorator | Yields |
|---|---|
| `@Input(key?)` | `opts.input` or `opts.input[key]` |
| `@Ctx()` | `opts.ctx` |
| `@Options()` | the whole `opts` (typed as `ProcedureOptions`) |
| `@RawInput()` | `opts.rawInput` (pre-validation) |
| `@Type()` | `'query' \| 'mutation' \| 'subscription'` |
| `@Path()` | the procedure path string |

Throw `TRPCError` from `@trpc/server` for client-visible failures. Nest's `HttpException`
is not translated into a tRPC error shape, so it surfaces as an opaque 500.

Details, subscription patterns and router merging: [references/routers.md](references/routers.md).

## Middlewares and context

Middlewares are `@Injectable()` classes implementing `TRPCMiddleware`, applied with
`@UseMiddlewares(...)` on a class (all procedures) or a method (that one only) or globally
via `globalMiddlewares`. Execution order is global → router → procedure → handler.

```typescript
@Injectable()
export class ProtectedMiddleware implements TRPCMiddleware {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  async use(opts: MiddlewareOptions<object>): Promise<MiddlewareResponse> {
    const result = await opts.next({ ctx: { user: await this.userService.current() } });
    return result;
  }
}
```

Two rules that cause most middleware bugs: always `return` the result of `next()` so the
chain isn't swallowed and pass added context *through* `next({ ctx })` rather than mutating
`opts.ctx` in place.

Context is a class implementing `TRPCContext` with a `create(opts)` method, registered in
`providers` and passed to `forRoot({ context })`. It runs once per request and is the right
home for the request object, session and per-request loaders.

Full treatment including typing context across a middleware chain and procedure `meta`:
[references/middlewares-and-context.md](references/middlewares-and-context.md).

## Recommended file layout

Mirrors NestJS conventions, which is the whole point of the adapter:

```
src
├── app.module.ts
├── app.context.ts
├── main.ts
├── @generated/          # CLI output — gitignore or commit, but be consistent
└── user/
    ├── user.router.ts       # the "controller" — thin, no business logic
    ├── user.service.ts      # business logic, unit-testable without tRPC
    ├── user.schema.ts       # Zod schemas + inferred types, shared by both
    └── protected.middleware.ts
```

Keep routers thin. A router method that only validates, delegates to a service and maps
errors stays testable and keeps the CLI's job easy.

## Docs errata

The official docs mix v1 and v2 content. These are the ones that will actually break your
build:

- **`@Ctx()`, not `@Context()`.** The routers and middlewares pages show `@Context()`; the
  exported decorator is `Ctx`. (`Context` as an identifier does exist in the docs' prose as
  a *type* name, which is where the confusion comes from.)
- **`MiddlewareOptions`, not `TRPCMiddlewareOptions`.** The latter is not exported.
- **`TRPCMiddleware<TMeta>` — the single generic is the meta type, not the context type.**
  The docs' `implements TRPCMiddleware<Context>` is wrong. Context types are supplied via
  `MiddlewareOptions<TContext, TReturnContext, TMeta>` on the `use()` signature.
- **`autoSchemaFile` and `schemaFileImports` are v1 options.** They are absent from the v2
  `TRPCModuleOptions` type and will be TypeScript errors, even though the context, client,
  and integrations pages still show `autoSchemaFile`. Control output with the CLI's
  `--output` flag instead.
- **`nestjs-trpc/types` is a v1 import path.** v1's ts-morph generator wrote helper types
  (`Context`, `{Middleware}Context`) into the package; v2's Rust CLI emits a single
  `server.ts` instead. Don't import from `nestjs-trpc/types` on v2 — declare your context
  types yourself.
- **`@Middlewares()` is deprecated** in favour of `@UseMiddlewares()`, to match `@UseGuards`.
- The middlewares page's first example has a literal typo (`constructror`) and a missing
  `async`. Don't copy it verbatim.

## Reference files

Read these when the task goes past the basics:

- **[references/routers.md](references/routers.md)** — procedure and parameter decorators in
  full, subscriptions/SSE with `AbortSignal` cleanup, alias merging, error handling,
  testing routers.
- **[references/middlewares-and-context.md](references/middlewares-and-context.md)** —
  `MiddlewareOptions` generics, context propagation and typing, `meta`-driven authorization,
  global middleware ordering.
- **[references/module-config.md](references/module-config.md)** — every `forRoot` option,
  SSE and JSONL keep-alive settings, `onError` handlers, custom loggers, transformers.
- **[references/codegen-and-client.md](references/codegen-and-client.md)** — CLI flags,
  ESM `--import-extension`, schema-flattening failures, consuming `AppRouter` from React /
  Next.js / vanilla clients, `AppRouterHost` for e2e tests and trpc-ui.
- **[references/api-reference.md](references/api-reference.md)** — exact exported symbols and
  type signatures transcribed from the shipped `.d.ts`. Check here before guessing a name.
