# Middlewares and Context

Contents:
- [Middleware anatomy](#middleware-anatomy)
- [The `MiddlewareOptions` generics](#the-middlewareoptions-generics)
- [Applying middlewares](#applying-middlewares)
- [Execution order](#execution-order)
- [Extending the context from a middleware](#extending-the-context-from-a-middleware)
- [Procedure `meta` for authorization](#procedure-meta-for-authorization)
- [Context classes](#context-classes)
- [Typing context on v2](#typing-context-on-v2)

## Middleware anatomy

A middleware is an `@Injectable()` class implementing `TRPCMiddleware`, with a single
`use()` method. It's the tRPC analogue of a Nest guard or interceptor and it can do both
jobs: reject a request or wrap it and observe the result.

```typescript
import {
  MiddlewareOptions,
  MiddlewareResponse,
  TRPCMiddleware,
} from 'nestjs-trpc';
import { Inject, Injectable, ConsoleLogger } from '@nestjs/common';

@Injectable()
export class LoggedMiddleware implements TRPCMiddleware {
  constructor(
    @Inject(ConsoleLogger) private readonly logger: ConsoleLogger,
  ) {}

  async use(opts: MiddlewareOptions<object>): Promise<MiddlewareResponse> {
    const start = Date.now();
    const { next, path, type } = opts;

    const result = await next();

    const durationMs = Date.now() - start;
    const meta = { path, type, durationMs };

    result.ok
      ? this.logger.log('OK request timing:', meta)
      : this.logger.error('Non-OK request timing', meta);

    return result;
  }
}
```

Register it in the module's `providers` array like any other provider. Without that, DI
can't construct it.

Two mistakes account for most middleware bugs:

1. **Not returning `next()`'s result.** `use()` must return the `MiddlewareResponse`. Drop
   it and the chain terminates with an undefined result — the procedure appears to hang or
   return nothing, with no error pointing at the middleware.
2. **Assuming `next()` throws on failure.** It doesn't. It resolves to a discriminated union
   — `{ ok: true, data }` or `{ ok: false, error }`. Inspect `result.ok`; a bare `try/catch`
   around `next()` will not see procedure errors.

Note the upstream docs' first middleware example contains a typo (`constructror`) and omits
`async` on a method that awaits. Use the shape above.

## The `MiddlewareOptions` generics

```typescript
export type MiddlewareResponse = Promise<
  | { ok: true;  data: unknown }
  | { ok: false; error: unknown }
>;

export type MiddlewareOptions<
  TContext extends object = object,
  TReturnContext = Record<string, unknown>,
  TMeta = unknown,
> = {
  ctx: TContext;
  type: TRPCProcedureType;
  path: string;
  input: unknown;
  getRawInput: () => Promise<unknown>;
  meta: TMeta;
  signal: AbortSignal | undefined;
  next: (opts?: { ctx?: TReturnContext }) => MiddlewareResponse;
};

export interface TRPCMiddleware<TMeta = unknown> {
  use(
    opts: MiddlewareOptions<object, Record<string, unknown>, TMeta>,
  ): MiddlewareResponse | Promise<MiddlewareResponse>;
}
```

The generic positions matter and the docs get them wrong:

- **`TRPCMiddleware<T>` — `T` is the *meta* type**, not the context type. The docs' snippet
  `implements TRPCMiddleware<Context>` is incorrect. If your middleware reads `opts.meta`,
  that's what the class-level generic is for.
- **Context types go on `MiddlewareOptions`**: `TContext` is what you receive, `TReturnContext`
  is what you're allowed to pass to `next({ ctx })`.
- The exported type is **`MiddlewareOptions`**. `TRPCMiddlewareOptions`, used on the
  middlewares docs page, does not exist.
- `signal` is available here too, so a middleware can bail out early on a disconnected
  client.

## Applying middlewares

`@UseMiddlewares()` is both a method and a class decorator:

```typescript
export declare function UseMiddlewares(
  ...middlewares: Array<Class<TRPCMiddleware> | Constructor<TRPCMiddleware>>
): MethodDecorator & ClassDecorator;
```

```typescript
@Router({ alias: 'admin' })
@UseMiddlewares(AuthMiddleware)        // every procedure in this router
export class AdminRouter {
  @UseMiddlewares(RolesMiddleware)     // this procedure only, after AuthMiddleware
  @Query({ meta: { roles: ['admin'] } })
  async getUser() { ... }
}
```

Pass **classes, not instances** — the DI container constructs them.

`@Middlewares()` is the deprecated alias of the same thing, renamed to match Nest's
`@UseGuards` convention. Use `@UseMiddlewares()`.

Global middlewares go on the module:

```typescript
TRPCModule.forRoot({
  globalMiddlewares: [LoggedMiddleware, ErrorReportingMiddleware],
}),
// ...and still need to be in providers:
providers: [LoggedMiddleware, ErrorReportingMiddleware],
```

## Execution order

```
global middlewares → router middlewares → procedure middlewares → handler
```

Within each tier, the order you listed them in. Since each wraps the next via `next()`, a
middleware's post-`next()` code runs in reverse order on the way back out — so the *first*
global middleware is the outermost and the best place for timing and error reporting.

Order has security consequences: authentication must precede authorization, because the
roles check reads the user that auth put on the context. Putting `RolesMiddleware` before
`AuthMiddleware` gives you a check against an empty context, which typically fails open or
throws confusingly.

## Extending the context from a middleware

Pass new values through `next()`. Don't mutate `opts.ctx` — the merge is what tRPC tracks
for typing and in-place mutation is invisible to it.

```typescript
@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async use(
    opts: MiddlewareOptions<{ req: Request }, { auth: { userId: string } }>,
  ): Promise<MiddlewareResponse> {
    const userId = await this.authService.verify(opts.ctx.req.headers.authorization);

    if (userId == null) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in.' });
    }

    return opts.next({ ctx: { auth: { userId } } });
  }
}
```

Throwing `TRPCError` from a middleware is the right way to reject — it short-circuits the
chain and reaches the client with the correct code.

The value passed to `next({ ctx })` is **merged into** the existing context, not swapped for
it, so downstream sees both the base context and your additions.

## Procedure `meta` for authorization

`meta` lets a procedure declare requirements declaratively and a middleware enforce them
generically — one middleware instead of a bespoke check per procedure:

```typescript
@Router({ alias: 'admin' })
@UseMiddlewares(RolesMiddleware)
export class AdminRouter {
  @Query({
    input: z.object({ userId: z.string() }),
    meta: { roles: ['admin'] },
  })
  async getUser(@Input('userId') userId: string) {
    return this.userService.getUser(userId);
  }

  @Mutation({
    input: z.object({ userId: z.string() }),
    meta: { roles: ['admin', 'moderator'] },
  })
  async deleteUser(@Input('userId') userId: string) {
    return this.userService.deleteUser(userId);
  }
}
```

```typescript
interface RolesMeta {
  roles: string[];
}

@Injectable()
export class RolesMiddleware implements TRPCMiddleware<RolesMeta> {
  async use(
    opts: MiddlewareOptions<AuthContext, Record<string, unknown>, RolesMeta>,
  ): Promise<MiddlewareResponse> {
    const { meta, ctx, next } = opts;

    if (!meta?.roles?.some((role) => ctx.auth.roles.includes(role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }

    return next();
  }
}
```

Guard against absent `meta`. A procedure in the same router without a `meta.roles` will
otherwise throw a `TypeError` reading `.includes` of undefined — and depending on where it
lands, that can read as a 500 rather than a denial. Decide deliberately whether missing meta
means "public" or "deny" and write it explicitly.

## Context classes

Context is created once per request, before any middleware runs. It's the natural home for
the request/response objects, the session and per-request caches or DataLoaders.

```typescript
// app.context.ts
import { Inject, Injectable } from '@nestjs/common';
import { ContextOptions, TRPCContext } from 'nestjs-trpc';

@Injectable()
export class AppContext implements TRPCContext {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  async create(opts: ContextOptions): Promise<Record<string, unknown>> {
    return {
      req: opts.req,
      res: opts.res,
      auth: { user: await this.userService.fromRequest(opts.req) },
    };
  }
}
```

```typescript
export type ContextOptions = CreateExpressContextOptions | CreateFastifyContextOptions;

export interface TRPCContext {
  create(opts: ContextOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
}
```

`ContextOptions` is a union of the Express and Fastify shapes — the adapter detects your
driver automatically. If you touch driver-specific properties, narrow the type first, or
your code breaks the day someone swaps the platform package.

Wire it up in two places — `providers` and the `context` option:

```typescript
@Module({
  imports: [TRPCModule.forRoot({ context: AppContext })],
  providers: [AppContext],
})
export class AppModule {}
```

Missing it from `providers` is the usual cause of a context that's mysteriously empty.

Keep `create()` cheap. It runs on **every** request including ones that will be rejected, so
a database round-trip here is a per-request tax on your whole API. Prefer putting expensive
lookups in a middleware that only guards the procedures that need them or return a lazy
loader from the context.

### Inner and outer context

The tRPC convention of splitting "inner" (no request, easy to construct in tests) from
"outer" (request-derived) works here too:

```typescript
@Injectable()
export class AppContext implements TRPCContext {
  constructor(@Inject(InnerContext) private readonly innerContext: InnerContext) {}

  async create(opts: ContextOptions): Promise<Record<string, unknown>> {
    const contextInner = await this.innerContext.create(opts);
    return { ...contextInner, req: opts.req, res: opts.res };
  }
}
```

The payoff is that tests can build the inner context directly without faking an HTTP
request. See https://trpc.io/docs/server/context#inner-and-outer-context.

## Typing context on v2

v1 generated helper types (`Context`, `{MiddlewareName}Context`) importable from
`nestjs-trpc/types`. **v2's Rust CLI does not generate them** — it emits a single `server.ts`
with the `AppRouter` type. Documentation pages that say `import type { Context } from
'nestjs-trpc/types'` are v1 leftovers and will not resolve.

Declare the types yourself and export them alongside the code that produces them:

```typescript
// app.context.ts
export interface AppContextShape {
  req: Request;
  res: Response;
  auth: { user: User | null };
}

// auth.middleware.ts — what the context looks like downstream of this middleware
export interface AuthContext extends AppContextShape {
  auth: { user: User; userId: string };
}
```

Then use them explicitly at the call sites:

```typescript
async use(opts: MiddlewareOptions<AppContextShape, { auth: { userId: string } }>) { ... }

@Query({ output: userSchema })
async getProfile(@Ctx() ctx: AuthContext) {
  return this.userService.getUserById(ctx.auth.userId);
}
```

This is manual and nothing enforces that the annotation on `@Ctx()` matches what the
middleware chain actually produced — the cast is on trust. Keep the interface definition
next to the middleware that establishes it so the two stay in sync and be aware this is the
one place in the stack where you lose end-to-end inference.
