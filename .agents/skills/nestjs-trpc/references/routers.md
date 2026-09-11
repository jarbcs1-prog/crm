# Routers, Procedures and Subscriptions

Contents:
- [The `@Router()` decorator](#the-router-decorator)
- [Procedure decorators](#procedure-decorators)
- [Input and output schemas](#input-and-output-schemas)
- [Parameter decorators](#parameter-decorators)
- [Error handling in procedures](#error-handling-in-procedures)
- [Subscriptions](#subscriptions)
- [Merging routers under one alias](#merging-routers-under-one-alias)
- [Testing routers](#testing-routers)

## The `@Router()` decorator

```typescript
export declare function Router(args?: { alias?: string }): ClassDecorator;
```

Marks a class as a tRPC router. The class must also be listed in its module's `providers`
array — `@Router()` records metadata, it does not register the class with Nest.

`alias` sets the namespace the procedures live under on the client. `@Router({ alias: 'users' })`
with a `getUserById` method produces `trpc.users.getUserById`. Without an alias, the class
name is used, which means renaming the class is a breaking API change — prefer an explicit
alias on anything a client depends on.

Routers support constructor injection like any provider:

```typescript
@Router({ alias: 'users' })
export class UserRouter {
  constructor(@Inject(UserService) private readonly userService: UserService) {}
}
```

Only providers visible in the same module (or exported by an imported module) can be
injected — the ordinary Nest resolution rules apply, with the ordinary
`Nest can't resolve dependencies of the UserRouter` error when they don't.

## Procedure decorators

```typescript
function Query(args?:        { input?: Parser; output?: Parser; meta?: Record<string, unknown> }): MethodDecorator;
function Mutation(args?:     { input?: Parser; output?: Parser; meta?: Record<string, unknown> }): MethodDecorator;
function Subscription(args?: { input?: Parser; output?: Parser; meta?: Record<string, unknown> }): MethodDecorator;
```

| Decorator | Compiles to | Use for |
|---|---|---|
| `@Query` | `publicProcedure.query()` | reads; cacheable, batchable, GET-able |
| `@Mutation` | `publicProcedure.mutation()` | writes and side effects |
| `@Subscription` | `publicProcedure.subscription()` | long-lived SSE streams |

The query/mutation split is a real contract, not decoration — tRPC clients batch and cache
queries and React Query treats them differently. A "query" that writes will be retried and
deduplicated in ways you don't want.

All three arguments are optional; `@Query()` with no arguments is a valid no-input procedure.

## Input and output schemas

`input` validates the payload before your method body runs. Validation failure produces a
`BAD_REQUEST` tRPC error automatically — you don't write that check.

`output` is optional. Omitted, the return type is inferred from the method's TypeScript
signature (v2.11.0+). Provided, it validates on the way out and — critically — **strips
properties not in the schema**. That makes it the cheapest defence against accidentally
serialising internal fields:

```typescript
// user.schema.ts
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  passwordHash: z.string(),   // internal
});

export const publicUserSchema = userSchema.omit({ passwordHash: true });

// user.router.ts
@Query({ output: publicUserSchema })   // passwordHash cannot escape
async getProfile(): Promise<User> { ... }
```

The `Parser` type accepts any Standard Schema v1 validator plus the Zod/Valibot/ArkType/Yup/
Superstruct/custom-function shapes. In practice **use Zod**: the CLI's schema flattening —
the step that inlines your schemas into the generated `server.ts` — is written against Zod,
and other libraries are far more likely to hit the "could not flatten" path.

Define schemas at module scope, not inline inside the decorator, when they're shared. The
CLI has to resolve them statically; a schema built by a helper function call at runtime is
something it may not be able to follow.

## Parameter decorators

These destructure the tRPC `opts` object into method parameters.

| Decorator | Signature | Yields |
|---|---|---|
| `@Input(key?)` | `Input(key?: string): ParameterDecorator` | `opts.input` or `opts.input[key]` when `key` given |
| `@Ctx()` | `Ctx(): ParameterDecorator` | `opts.ctx` |
| `@Options()` | `Options(): ParameterDecorator` | the whole `opts` |
| `@RawInput()` | `RawInput(): ParameterDecorator` | `opts.rawInput` — unvalidated |
| `@Type()` | `Type(): ParameterDecorator` | `opts.type` |
| `@Path()` | `Path(): ParameterDecorator` | `opts.path` |

The decorator is **`@Ctx()`**. The published docs write `@Context()` in the routers and
middlewares examples; that symbol is not exported and the import will fail. The official
`examples/nestjs-express/src/user.router.ts` uses `@Ctx()`.

`@Options()` is typed by `ProcedureOptions`:

```typescript
export type ProcedureOptions = {
  ctx: unknown;
  input: unknown;
  type: string;
  path: string;
  rawInput: unknown;
  signal: AbortSignal | undefined;
};
```

A full example combining them, from the upstream repo:

```typescript
@Query({
  input: z.object({ userId: z.string() }),
  output: userSchema,
})
@UseMiddlewares(ProtectedMiddleware)
async getUserById(
  @Input('userId') userId: string,
  @Ctx() ctx: object,
  @Options() opts: ProcedureOptions,
): Promise<User> {
  return this.userService.getUser(userId);
}
```

`@RawInput()` bypasses validation, so treat whatever it returns as untrusted. It's for
things like webhook signature verification that need the payload exactly as received.

## Error handling in procedures

Throw `TRPCError` from `@trpc/server`:

```typescript
import { TRPCError } from '@trpc/server';

throw new TRPCError({ code: 'NOT_FOUND', message: 'Could not find user.' });
```

Codes are tRPC's, not Nest's: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`TIMEOUT`, `CONFLICT`, `PRECONDITION_FAILED`, `PAYLOAD_TOO_LARGE`, `METHOD_NOT_SUPPORTED`,
`UNPROCESSABLE_CONTENT`, `TOO_MANY_REQUESTS`, `CLIENT_CLOSED_REQUEST`,
`INTERNAL_SERVER_ERROR`, `NOT_IMPLEMENTED`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE`,
`GATEWAY_TIMEOUT`.

Nest's `HttpException` / `NotFoundException` and Nest exception filters do **not** map onto
tRPC's error shape — the client sees an unhelpful `INTERNAL_SERVER_ERROR`. If a shared
service throws Nest exceptions, translate at the router boundary:

```typescript
try {
  return await this.userService.getUser(userId);
} catch (e) {
  if (e instanceof NotFoundException) {
    throw new TRPCError({ code: 'NOT_FOUND', message: e.message });
  }
  throw e;
}
```

Pass `cause` when wrapping so the original stack survives into your `onError` handler:
`new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: e })`.

For centralised reporting, register an `onError` handler on the module — see
[module-config.md](module-config.md).

## Subscriptions

Subscriptions stream over Server-Sent Events. The method is an **async generator** that
yields values:

```typescript
import { Router, Subscription, Input, Options } from 'nestjs-trpc';
import { z } from 'zod';

@Router({ alias: 'events' })
export class EventRouter {
  constructor(@Inject(EventService) private readonly eventService: EventService) {}

  @Subscription({
    input: z.object({ channelId: z.string() }),
  })
  async *onMessage(
    @Input('channelId') channelId: string,
    @Options() opts: { signal?: AbortSignal },
  ) {
    for await (const event of this.eventService.listen(channelId, opts.signal)) {
      yield event;
    }
  }
}
```

`input`, `@UseMiddlewares()` and DI all work exactly as they do for queries.

### Cleaning up on disconnect

The `AbortSignal` is how you learn the client went away. A generator that ignores it leaks
one live handler per disconnected client and nothing will tell you it's happening until the
process runs out of memory. Either forward the signal into whatever you're subscribing to
(as above) or check it in your loop condition:

```typescript
async *onMessage(
  @Input('channelId') channelId: string,
  @Options() opts: { signal?: AbortSignal },
) {
  let count = 0;
  while (!opts.signal?.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    yield { message: `Event ${count++}`, timestamp: Date.now() };
  }
}
```

If you hold a resource that isn't signal-aware, wrap the body in `try/finally` and release
in the `finally` — it runs when the generator is disposed on disconnect.

### Keep-alive

Idle SSE streams get killed by proxies and load balancers, typically around 30–60s. Enable
server pings in `forRoot`:

```typescript
TRPCModule.forRoot({
  sse: {
    ping: { enabled: true, intervalMs: 30000 },
    client: { reconnectAfterInactivityMs: 60000 },
  },
})
```

Ping is **disabled by default** and the default `intervalMs` is `1000` — if you enable
pings without setting an interval you get one ping per second, which is almost never what
you want. Full option list in [module-config.md](module-config.md).

### Consuming from the client

```typescript
trpc.events.onMessage.useSubscription(
  { channelId: 'general' },
  {
    onData(event) {
      console.log('Received:', event);
    },
  },
);
```

## Merging routers under one alias

Since v2.4.0, two router classes sharing an `alias` are merged into one namespace. This lets
you split a large surface across files without flattening it on the client:

```typescript
@Router({ alias: 'users' })
export class UserReadRouter { /* getById, list */ }

@Router({ alias: 'users' })
export class UserWriteRouter { /* create, update */ }
```

Both contribute to `trpc.users.*`. Procedure names must still be unique across the merged
set — a collision is a generation-time error, not a runtime one.

## Testing routers

Because a router is a plain provider, unit tests need no tRPC machinery:

```typescript
const module = await Test.createTestingModule({
  providers: [UserRouter, { provide: UserService, useValue: mockUserService }],
}).compile();

const router = module.get(UserRouter);
await expect(router.getUserById('missing')).rejects.toThrow(TRPCError);
```

This calls the method directly, so decorator-driven `input`/`output` validation and
middlewares do **not** run. To exercise the real procedure pipeline, go through
`AppRouterHost` and create a server-side caller — see
[codegen-and-client.md](codegen-and-client.md#e2e-testing-with-approuterhost).
