# API Reference

Every public symbol exported from `nestjs-trpc`, transcribed from the shipped `.d.ts` files
at **v2.13.0**. When a name is in doubt, this file is authoritative over the published docs —
several documented identifiers don't exist.

Contents:
- [Export surface](#export-surface)
- [Class decorators](#class-decorators)
- [Method decorators](#method-decorators)
- [Parameter decorators](#parameter-decorators)
- [Module](#module)
- [Context types](#context-types)
- [Middleware types](#middleware-types)
- [Error handler types](#error-handler-types)
- [Procedure and parser types](#procedure-and-parser-types)
- [Streaming option types](#streaming-option-types)
- [`AppRouterHost`](#approuterhost)
- [Names the docs use that do not exist](#names-the-docs-use-that-do-not-exist)

## Export surface

`nestjs-trpc` re-exports from four barrels:

```typescript
export * from './trpc.module';
export * from './interfaces';
export * from './decorators';
export * from './app-router.host';
```

Everything below is importable directly from `'nestjs-trpc'`. The package also declares a
`nestjs-trpc/config` subpath export, which is not part of the documented API.

## Class decorators

```typescript
function Router(args?: { alias?: string }): ClassDecorator;
```

```typescript
function UseMiddlewares(
  ...middlewares: Array<Class<TRPCMiddleware> | Constructor<TRPCMiddleware>>
): MethodDecorator & ClassDecorator;

/** @deprecated Use `UseMiddlewares` instead. */
function Middlewares(
  ...middlewares: Array<Class<TRPCMiddleware> | Constructor<TRPCMiddleware>>
): MethodDecorator & ClassDecorator;
```

## Method decorators

All three share one argument shape:

```typescript
function Query(args?: {
  input?: Parser;
  output?: Parser;
  meta?: Record<string, unknown>;
}): MethodDecorator;

function Mutation(args?: {
  input?: Parser;
  output?: Parser;
  meta?: Record<string, unknown>;
}): MethodDecorator;

function Subscription(args?: {
  input?: Parser;
  output?: Parser;
  meta?: Record<string, unknown>;
}): MethodDecorator;
```

## Parameter decorators

```typescript
function Ctx(): ParameterDecorator;
function Input(key?: string): ParameterDecorator;
function Options(): ParameterDecorator;
function RawInput(): ParameterDecorator;
function Type(): ParameterDecorator;
function Path(): ParameterDecorator;
```

The context decorator is **`Ctx`**. There is no exported `Context` decorator.

## Module

```typescript
export declare class TRPCModule implements NestModule, OnModuleInit {
  static forRoot(options?: TRPCModuleOptions): DynamicModule;
  configure(_consumer: MiddlewareConsumer): Promise<void>;
  onModuleInit(): Promise<void>;
}
```

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

No `forRootAsync`.

## Context types

```typescript
export type ContextOptions =
  | CreateExpressContextOptions
  | CreateFastifyContextOptions;

export interface TRPCContext {
  create(
    opts: ContextOptions,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
}
```

## Middleware types

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

The single generic on `TRPCMiddleware` is the **meta** type.

## Error handler types

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

## Procedure and parser types

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

`Parser` is a union covering Standard Schema v1 and the common validator shapes:

```typescript
export type Parser =
  | ParserWithInputOutput<any, any>   // Zod, Valibot, ArkType, Standard Schema v1
  | ParserWithoutInput<any>;          // custom fn, my-zod, scale, superstruct, yup
```

Inlined from `@trpc/server` to avoid depending on its unstable internals.

Also exported from `factory.interface`, mostly internal but occasionally useful:

```typescript
export declare enum ProcedureParamDecoratorType {
  Options  = 'options',
  Ctx      = 'ctx',
  Input    = 'input',
  RawInput = 'rawInput',
  Type     = 'type',
  Path     = 'path',
}

export interface RouterInstance {
  name: string;
  instance: unknown;
  middlewares: Array<Class<TRPCMiddleware> | Constructor<TRPCMiddleware>>;
  alias?: string;
}

export interface ProcedureFactoryMetadata {
  type: ProcedureType;
  input: Parser | undefined;
  output: Parser | undefined;
  meta: Record<string, unknown> | undefined;
  middlewares: Array<Constructor<TRPCMiddleware> | Class<TRPCMiddleware>>;
  name: string;
  implementation: ProcedureImplementation;
  params: Array<ProcedureParamDecorator> | undefined;
}

export type TRPCRouter = <TProcRouterRecord extends TRPCRouterRecord>(
  procedures: TProcRouterRecord,
) => AnyRouter;

export type TRPCPublicProcedure = TRPCProcedureBuilder<any, any, any, any, any, any, any, any>;
```

## Streaming option types

```typescript
export interface TRPCSSEOptions {
  enabled?: boolean;                          // default true
  ping?: {
    enabled: boolean;                         // default false
    intervalMs?: number;                      // default 1000
  };
  maxDurationMs?: number;                     // default undefined
  emitAndEndImmediately?: boolean;            // default false
  client?: {
    reconnectAfterInactivityMs?: number;      // default undefined
  };
}

export interface TRPCJSONLOptions {
  pingMs?: number;                            // default undefined
}
```

## `AppRouterHost`

```typescript
export declare class AppRouterHost {
  set appRouter(schemaRef: AnyRouter);
  get appRouter(): AnyRouter;
}
```

The getter throws before the app is initialised.

## Names the docs use that do not exist

| In the docs | Actual |
|---|---|
| `@Context()` parameter decorator | `@Ctx()` |
| `TRPCMiddlewareOptions` | `MiddlewareOptions` |
| `TRPCMiddleware<Context>` (context as generic) | `TRPCMiddleware<TMeta>`; context goes on `MiddlewareOptions<TContext, …>` |
| `autoSchemaFile` module option | removed in v2 — use the CLI's `--output` |
| `schemaFileImports` module option | removed in v2 |
| `import … from 'nestjs-trpc/types'` | v1 only — v2 emits `server.ts`; declare context types yourself |
| `@Middlewares()` | deprecated alias of `@UseMiddlewares()` |

## Peer dependencies at v2.13.0

```json
{
  "@nestjs/common": "^9.3.8 || ^10.0.0 || ^11.0.0",
  "@nestjs/core":   "^9.3.8 || ^10.0.0 || ^11.0.0",
  "@trpc/server":   "^11.0.0",
  "zod":            "^3.14.0 || ^4.0.0",
  "rxjs":           "7.8.1",
  "reflect-metadata": "^0.1.13 || ^0.2.0"
}
```

CLI binaries ship for darwin x64/arm64, linux x64/arm64 (gnu) and win32 x64.

## Version landmarks

Useful when reading issues or deciding whether an upgrade is needed:

| Version | Change |
|---|---|
| 2.0.1 | Rust CLI replaces the ts-morph generator; watch mode |
| 2.1.0 | procedure `meta` support |
| 2.2.0 | custom logger |
| 2.3.0 | importability-aware schema flattening |
| 2.4.0 | routers sharing an `alias` are merged |
| 2.5.0 | transformer auto-detection during generation |
| 2.8.0 | global middlewares, `@Subscription`, injectable error handler |
| 2.9.0 | Zod 4 support; `TReturnContext` generic on `MiddlewareOptions` |
| 2.11.0 | output type inferred from resolver return type; NestJS 11 |
| 2.12.0 | ESM import-extension auto-detection from tsconfig |
| 2.13.0 | `sse` and `jsonl` options on `forRoot` |
