# Module Configuration

Contents:
- [`TRPCModuleOptions` in full](#trpcmoduleoptions-in-full)
- [`basePath`](#basepath)
- [`context`](#context)
- [`globalMiddlewares`](#globalmiddlewares)
- [`onError`](#onerror)
- [`errorFormatter`](#errorformatter)
- [`transformer`](#transformer)
- [`logger`](#logger)
- [`sse` — subscription streaming](#sse--subscription-streaming)
- [`jsonl` — batch stream keep-alive](#jsonl--batch-stream-keep-alive)
- [Options that no longer exist](#options-that-no-longer-exist)
- [Express and Fastify](#express-and-fastify)

## `TRPCModuleOptions` in full

Transcribed from the shipped `dist/interfaces/module-options.interface.d.ts` at v2.13.0:

```typescript
export interface TRPCModuleOptions {
  basePath?: string;
  context?: Class<TRPCContext>;
  errorFormatter?: TRPCErrorFormatter<any, TRPCDefaultErrorShape>;
  transformer?: DataTransformer | CombinedDataTransformer;
  logger?: LoggerService;
  onError?: Class<TRPCErrorHandler>;
  globalMiddlewares?: Array<Class<TRPCMiddleware> | Constructor<TRPCMiddleware>>;
  sse?: TRPCSSEOptions;
  jsonl?: TRPCJSONLOptions;
}
```

| Option | Type | Default |
|---|---|---|
| `basePath` | `string` | `"/trpc"` |
| `context` | `Class<TRPCContext>` | — |
| `errorFormatter` | `TRPCErrorFormatter` | — |
| `transformer` | `DataTransformer \| CombinedDataTransformer` | — |
| `logger` | `LoggerService` | `ConsoleLogger` |
| `onError` | `Class<TRPCErrorHandler>` | — |
| `globalMiddlewares` | `Array<Class<TRPCMiddleware>>` | `[]` |
| `sse` | `TRPCSSEOptions` | see below |
| `jsonl` | `TRPCJSONLOptions` | — |

`TRPCModule.forRoot(options?)` returns a `DynamicModule`. There is no `forRootAsync` — if
your configuration depends on runtime values, inject `ConfigService` into the context class
or a middleware rather than trying to await it at module definition time.

Every class you pass here (`context`, `onError`, `globalMiddlewares`) must **also** appear in
the module's `providers` array. `forRoot` records which class to use; `providers` is what
lets Nest build it.

## `basePath`

Where the tRPC handler mounts. Defaults to `/trpc`, so procedures live at
`/trpc/<alias>.<procedure>`.

```typescript
TRPCModule.forRoot({ basePath: '/api/trpc' })
```

This must match the `url` your client's `httpLink` points at, including any global prefix
you set with `app.setGlobalPrefix()` — the two compose and forgetting that is a common
source of 404s that look like missing procedures.

## `context`

The class implementing `TRPCContext`, created once per request. Covered in
[middlewares-and-context.md](middlewares-and-context.md#context-classes).

## `globalMiddlewares`

Applied to every procedure in the application, before router- and procedure-level
middlewares:

```typescript
@Module({
  imports: [
    TRPCModule.forRoot({
      globalMiddlewares: [LoggedMiddleware, ErrorReportingMiddleware],
    }),
  ],
  providers: [LoggedMiddleware, ErrorReportingMiddleware],
})
export class AppModule {}
```

Good fits: timing, logging, error reporting, rate limiting. Bad fit: authentication —
because a global auth middleware has to special-case every public procedure and those
exceptions are easy to get wrong. Prefer an explicit `@UseMiddlewares(AuthMiddleware)` on
the routers that need it, so the protected surface is visible in the code.

## `onError`

An injectable handler invoked whenever a procedure throws. Use it for reporting to Sentry
and friends — it observes, it can't rewrite the response.

```typescript
// app.error-handler.ts
import { Inject, Injectable } from '@nestjs/common';
import { OnErrorOptions, TRPCErrorHandler } from 'nestjs-trpc';

@Injectable()
export class AppErrorHandler implements TRPCErrorHandler {
  constructor(@Inject(LogService) private readonly logService: LogService) {}

  onError(opts: OnErrorOptions): void {
    this.logService.error(`[${opts.type}] ${opts.path}: ${opts.error.message}`);
  }
}
```

```typescript
export interface OnErrorOptions {
  error: TRPCError;
  type: TRPCProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: Record<string, unknown> | undefined;
  req: unknown;
}

export interface TRPCErrorHandler {
  onError(opts: OnErrorOptions): void;
}
```

```typescript
@Module({
  imports: [TRPCModule.forRoot({ onError: AppErrorHandler })],
  providers: [AppErrorHandler],
})
export class AppModule {}
```

`onError` returns `void` and is not awaited — don't put slow work on the request path here.
Note also that `opts.input` is the user's payload and `opts.ctx` may hold session data; both
will end up wherever you ship them, so redact before logging if you're subject to
data-handling rules.

To distinguish real bugs from expected rejections, filter on the code — a `NOT_FOUND` from a
mistyped id isn't an incident:

```typescript
onError(opts: OnErrorOptions): void {
  if (opts.error.code === 'INTERNAL_SERVER_ERROR') {
    this.sentry.captureException(opts.error.cause ?? opts.error, { extra: { path: opts.path } });
  }
}
```

## `errorFormatter`

Shapes what the client receives. This is the one that *can* change the payload — use it to
attach structured validation errors and to make sure internal messages don't escape in
production.

```typescript
TRPCModule.forRoot({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
})
```

Unlike `onError`, this is a plain function on the options object, not an injectable class.

See https://trpc.io/docs/error-formatting.

## `transformer`

A data transformer, for types JSON can't represent — `Date`, `Map`, `Set`, `BigInt`,
`undefined`:

```typescript
import superjson from 'superjson';

TRPCModule.forRoot({ transformer: superjson })
```

The client must be configured with the **same** transformer or every request fails to
deserialize. Since v2.5.0 the CLI auto-detects the transformer when generating the schema,
so the generated types account for it.

Adding or removing a transformer is a breaking wire-format change — deploy both sides
together.

## `logger`

Any `LoggerService` implementation replaces the default `ConsoleLogger`:

```typescript
import { Module } from '@nestjs/common';
import { TRPCModule } from 'nestjs-trpc';
import { MyLogger } from './my-logger.service';

@Module({
  imports: [TRPCModule.forRoot({ logger: new MyLogger() })],
})
export class AppModule {}
```

This takes an **instance**, not a class — it's the one option that isn't DI-resolved, so a
logger needing injected dependencies has to be constructed manually or obtained from the
app context. Pino and Winston adapters (e.g. `nestjs-pino`) satisfy the interface.

## `sse` — subscription streaming

```typescript
export interface TRPCSSEOptions {
  /** Enable SSE subscriptions. @default true */
  enabled?: boolean;
  ping?: {
    /** @default false */
    enabled: boolean;
    /** Interval in milliseconds. @default 1000 */
    intervalMs?: number;
  };
  /** Max duration in ms before ending the stream. @default undefined */
  maxDurationMs?: number;
  /** End the request immediately after data is sent. @default false */
  emitAndEndImmediately?: boolean;
  client?: {
    /** Client reconnects after this much inactivity, in ms. @default undefined */
    reconnectAfterInactivityMs?: number;
  };
}
```

Added in v2.13.0. A sensible production baseline:

```typescript
TRPCModule.forRoot({
  sse: {
    ping: { enabled: true, intervalMs: 30000 },
    client: { reconnectAfterInactivityMs: 60000 },
  },
})
```

Points worth knowing:

- **Ping defaults to off** and its `intervalMs` defaults to `1000`. Enabling pings without
  an explicit interval gives one ping per second per open stream — set the interval.
- Pick an interval below your proxy's idle timeout. 30s is safe against the common 60s
  default in nginx, ALB and Cloudflare.
- `client.reconnectAfterInactivityMs` should be comfortably longer than `ping.intervalMs`,
  or clients will reconnect between healthy pings.
- `emitAndEndImmediately` exists for serverless runtimes that can't hold a streaming
  response open. On a normal long-lived Node server, leave it off — it defeats the point of
  a subscription.
- `maxDurationMs` caps stream lifetime. Useful where an upstream load balancer will sever
  the connection anyway; ending it deliberately produces a cleaner client reconnect than
  being cut off.

## `jsonl` — batch stream keep-alive

```typescript
export interface TRPCJSONLOptions {
  /** Interval in ms between keep-alive pings on streamed batch responses. @default undefined */
  pingMs?: number;
}
```

Applies to `httpBatchStreamLink`, not subscriptions. Set it if you batch requests where one
slow procedure can hold the response open past a proxy's idle timeout:

```typescript
TRPCModule.forRoot({ jsonl: { pingMs: 30000 } })
```

## Options that no longer exist

`autoSchemaFile` and `schemaFileImports` were v1 options and are **not** in the v2
`TRPCModuleOptions` type — passing them is a TypeScript error. Several published docs pages
(context, client, integrations) still show `autoSchemaFile: './src/@generated'`.

In v2, output location is a CLI concern: `nestjs-trpc generate --output ./src/@generated`.
See [codegen-and-client.md](codegen-and-client.md).

(The v2 CLI does still recognise an `autoSchemaFile` literal when scanning your `forRoot`
call, for the benefit of projects migrating from v1. Don't rely on it — it isn't part of the
typed API.)

## Express and Fastify

Both are supported natively; the adapter inspects Nest's `HttpAdapterHost` and picks the
right tRPC adapter. No configuration needed.

The visible consequence is in `ContextOptions`, which is
`CreateExpressContextOptions | CreateFastifyContextOptions`. Narrow before reaching for
driver-specific request properties and your context stays portable.
