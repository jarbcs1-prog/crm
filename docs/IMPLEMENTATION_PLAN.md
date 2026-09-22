# Implementation and Execution Plan — CRM Code Optimization
Generated: 2026-09-15 — Branch: `feat/agent-providers` — Stack: Next 16/NestJS 11/Prisma 7/better-auth 1.6/Turborepo 2.10/eve 0.31.2/Bun 1.3.12

> Source: full-repo optimization scan of `F:\crm` (~430 TS/TSX files, ~35k LOC, 548-lock bun). Evidence references are `path:line`.

---

## 1. Objective and Non-Goals

**Objective:** Close measured performance bottlenecks, security gaps and reliability edge cases without changing user-visible behavior except for measurably faster lists/search, smaller bundles and hardened headers/rate-limits.

**Non-Goals:** No product features, no data model migration beyond `pg_trgm`, no vector/embedding pipeline yet (noted as future lane).

**Success signals:** Gmail sync tick <5s (was 15–60s), search <100ms p95 per keystroke, deep list page (>50) <400ms, bundle -45kB gz, `bun audit` clean on patched advisories, no `timingSafeEqual` divergence, facet correctness under filters.

---

## 2. Analysis Scope (what was scanned)

| Area | Paths | Lines sampled |
|---|---|---|
| API | `apps/api/src/**/ *.ts` — `gmail-sync.service.ts:239`, `calendar-sync.service.ts:313`, `google-match.service.ts:55`, `search.service.ts:26`, `trpc/list-input.ts:21`, `companies:107`/`contacts:127`/`deals:96`/`workspace.service.ts:217`, `dashboard.service.ts:67`, `image-mirror.service.ts:62`, `activity-stamp.service.ts:78`, `import/sql-scanner.ts:39` | ~180 files |
| App | `apps/app` — `proxy.ts:27`, `next.config.ts:11`, `components/crm/record-sheet-host.tsx:14`, `components/crm/agent-panel.tsx:48`, `app/(app)/page.tsx:29`, `app/api/[...path]/route.ts:14`, `app/eve/v1/[...path]/route.ts:10` | ~90 files |
| Agent + DB/Auth/Env | `apps/agent/agent/lib/{web-search,lookup,pool,dispatch,tasks,capabilities}.ts`, `channels/{telegram,voice,eve,crm}.ts:156/88/44/17`, `packages/db/src/{safe-fetch,blob,favicon,workspace}.ts`, `packages/auth/src/auth.ts:61`, `packages/env/src/index.ts:87` | ~90 files |
| UI | `packages/ui/src/lib/format.ts:14`, `components/chart.tsx:93`, `hooks/use-mobile.ts:6`, `components/data-table.tsx:161` | ~60 files |
| Deps/lock | `package.json:24` / `apps/*/*/package.json` / `bun.lock:205` / `turbo.json:23` / `.env.example:8` / `apps/api/src/config/env.validation.ts:104` | — |

Reusable recon sessions: `exp-2` (app frontend), `exp-3` (agent/db), `lib-1` (deps/headers). See synthesis below.

---

## 3. Performance Findings — Ranked

### 3.1 Critical (fix in P1 lane)

1. **Gmail sequential N+1** — `apps/api/src/google/gmail-sync.service.ts:239` loop `for(id of batch){ await getMessage; await store() }` (up to 120 msgs/tick). `store():259` is 7 DB round-trips/msg (two `findUnique`, `upsert thread:298`, `create message:313`, `aggregate:330`, `update thread:340`, `upsert activity:387`). **Cost:** 840 sequential ops/tick, lease `VISIBLE_BATCH 60 / VISIBLE_LEASE 2m` contention.
2. **Full scans with `contains mode:insensitive` per keystroke** — `apps/api/src/search/search.service.ts:26` fires 3× `findMany take:5` on `name/domain/email` (term len 2 hits DB). Same pattern `companies:475` / `contacts:529` / `deals:326` `searchFilter`. No `pg_trgm`/GIN, no cache.
3. **Offset pagination everywhere** — `apps/api/src/trpc/list-input.ts:21` `skip=(page-1)*pageSize` used by `companies:108`/`contacts:127`/`deals:96`/`workspace.members:172`. Deep pages (`page=1000` → OFFSET 25000) scan. `activities` correctly uses cursor `activities.service.ts:82`.
4. **Full user-table scan every tick** — `apps/api/src/google/google-match.service.ts:55` `user.findMany(select email)` no pagination, called via `internalIdentity()` at `gmail-sync:226` + `calendar-sync:74` (`Promise.all` with `suppressedDomains`). O(users).
5. **`Intl` per call on hot paths** — `packages/ui/src/lib/format.ts:14,22,31,37,68` `new Intl.NumberFormat/DateTimeFormat` + `Date.now()` per table cell/dashboard stat → GC pressure.
6. **Divergent in-memory dashboard cache + 200-row JS loop** — `apps/api/src/dashboard/dashboard.service.ts:39 TtlCache 30s key=${userId}:${scope}` per-instance stale + `67 take:200` then loop `177` for trend/wins/cycleDays (6 queries/tick).

### 3.2 Important (P2 lane)

7. Calendar attendee N+1 — `calendar-sync.service.ts:313 for(attendee) await upsert:316` + `352 await agent.meetingSoon` serial.
8. Image-mirror sequential I/O — `image-mirror.service.ts:62,97,123` `for(row) for(field) await mirror()` (HTTP + blob) — `MAX_PER_SWEEP 25` under-utilised.
9. Over-fetch then rank in agent — `agent/lib/lookup.ts:101,153,197 take:limit*3` then JS `score()` + `agent/lib/web-search.ts:458 for(term) await ask` serial providers.
10. Bundle heaviness — `packages/ui/src/components/chart.tsx:5 barrel recharts`, `agent-panel.tsx:48 8× @carbon/icons-react/es/* + eve/react eager`, `next.config.ts:11` missing `optimizePackageImports`, no `images.formats`. ~45kB gz.
11. Render-phase state + hydration flicker — `record-sheet-host.tsx:14 setShown(top)` during render, `packages/ui/src/hooks/use-mobile.ts:6 useState<undefined>+useEffect` media-query.
12. Missing streaming boundaries — `apps/app/app/(app)/page.tsx:29 await Promise.all(prefetch)` blocks page, zero `loading.tsx/error.tsx/Suspense`.

---

## 4. Security Findings — Ranked

### 4.1 Critical / High

1. **Hardcoded fallback credential** — `apps/agent/agent/lib/nonoh-sip.ts:18 password ?? "NO2026noh!"` (also `username jarbcs`, `server sip.nonoh.net`). Committed secret.
2. **Unauthenticated open proxy** — `apps/app/app/api/[...path]/route.ts:14` forwards any verb + `request.headers` (minus `host`) to `${API_URL}${pathname}${search}`, no `auth()` guard, no origin allow-list, no body limit, streams `upstream.body` verbatim, `console.error` leak on 502.
3. **No global rate-limit / CORS explicitness** — `apps/api/src/create-app.ts:18 helmet()` defaults only, `app.module.ts` no `ThrottlerModule`, `express-rate-limit 8.6.1` unused, `app.enableCors()` never called (relies on opaque `BetterAuthModule` via `packages/auth/src/auth.ts:76` → `trustedOrigins` from `APP_URL` csv).
4. **Weak `AGENT_BRIDGE_SECRET` validation + inconsistent fail-open** — `apps/api/src/config/env.validation.ts:104 @IsOptional @IsString` no `@MinLength(32)` (contrast `BETTER_AUTH_SECRET:32`/`CRON_SECRET:16`). `apps/agent/agent/channels/eve.ts:44` falls through to `vercelOidc|localDev` when unset, while `crm.ts:11`/`voice.ts:90` fail-closed.
5. **Timing side-channel** — `apps/agent/agent/channels/voice.ts:88 === Bearer` vs correct `timingSafeEqual` in `crm.ts:17` and `sync.controller.ts:55` (latter short-circuits on `a.length!==b.length`).

### 4.2 Medium (hardening)

6. **CSS injection via `dangerouslySetInnerHTML`** — `packages/ui/src/components/chart.tsx:93 --color-${key}: ${color}` unsanitized `ChartConfig` → `</style><img onerror>`.
7. **Error info leak** — `apps/api/src/logging/all-exceptions.filter.ts:90` spreads `HttpException.getResponse()` (Prisma `P2002`, Zod issues) to client; `route.ts:50 console.error` raw.
8. **Missing CSP/HSTS/Permissions-Policy** — `apps/app/next.config.ts:11` no `headers()`, `create-app.ts:18` default `helmet` no custom CSP/`frameAncestors 'none'`.
9. **SSO/egress gaps** — `sso.service.ts:199 splitDomains:95` not TLD-validated, `egress-guard.ts:18` regex-only (paraphrase bypass), agent `web_search/web_fetch` prompt-only guard per `SECURITY.md:21`.
10. **Ops**: `better-auth rateLimit.storage:"database"` (`packages/auth/src/auth.ts:61`) hots `RateLimit@@unique[key]`; no Redis secondary; no `ThrottlerGuard` on voice/telegram lanes.

**Good controls confirmed:** `BETTER_AUTH_SECRET` 32-char + known-value rejection `env.validation:181`, `CRON_SECRET` fail-closed 503/403, `ValidationPipe whitelist+forbidNonWhitelisted`, `safe-fetch.ts:171 validatedIp` IP-block (`0/8,10/8,127/8,172.16/12,192.168/16,100.64/10,198.18/15,224+, fc00::/7, fe80::, ff00::, 2002::, 2001::`) with `Host` pinning + `MAX_REDIRECTS=3`, `AllowAnonymous` limited to `health:20 + sync`, TRPC `AuthMiddleware:17` enforced.

---

## 5. Reliability & Edge Cases

- **Facet cache wrongness:** `companies:503` / `contacts:555` / `deals:358` key on `q.trim()` only → filters ignored → stale facets.
- **`deals:336 owner===FACET_UNASSIGNED ? {in:[]}` bug** → 0 rows instead of `ownerId: null`.
- **`FOR UPDATE` serialization:** `workspace.service.ts:217,264 SELECT ... FOR UPDATE` inside `$transaction` serialises parallel role changes; `activity-stamp.service.ts:78 $transaction([6x $executeRaw])` locks 3 tables.
- **Task race:** `tasks.ts:62 findFirst→update/create` TOCTOU duplicates + `pool.ts:9 collapsing` drops intermediate `drainAll`; `claimDue` `SKIP LOCKED` good but `MAX_ATTEMPTS=3` no backoff/jitter.
- **Telegram open webhook:** `telegram.ts:156 if(!TELEGRAM_USERID) return true` → bypass when env missing (also inconsistent with `crm/voice` fail-closed).
- **Memory spike:** `blob.ts:64 MAX_BYTES 3MB * 18 concurrent =54MB` + `favicon.ts:56 512k concat` no streaming `content-length` backpressure.
- **Edge latency:** `proxy.ts:27 await readOnboardingGate` per authenticated request in Edge, no cache.
- **Silent swallowing:** `dispatch.ts:39,112 .catch(()=>{})`, `pool.ts:30`, `portrait-sources.ts:125 } catch {}` hide brand/portrait/enrichment failures.
- **Env divergence:** `packages/env/src/index:87 catch{}` silent vs Nest validation throws; agent `capabilities.ts:11 Boolean(trim)` no Zod.
- **No streaming fallbacks:** zero `loading.tsx/error.tsx`.

---

## 6. Architecture & Dependencies

### 6.1 Code Quality
- Duplicated list fan-out (3 services, 7 queries/page each) + unbounded `byId` relations (`companies:192 includes contacts+deals` no `take`) → extract `createListQuery`.
- Hard-coded limits `VISIBLE_BATCH 60 / LEASE 2m / RESEARCH 12x30m / MAX_ATTEMPTS 3 / TIMEOUT 5s/15s/45s / MAX_HTML 512k / BODY_LIMIT 4000` in code, no env.
- `record-sheet-host:14` + `agent-panel:504` violate `docs/crm-plan.md:924` + `no-use-effect` skill (ref-chasing `latest.current`).

### 6.2 Dependency / Lock Findings (lib-1)

| Package | Declared → Locked | Gap | Advisory / Fix |
|---|---|---|---|
| `better-auth` | `1.6.25 → 1.6.26` drift (root `^1.6.26`, app/api/auth `1.6.25`, sso/cli `1.4.22`) | `1.6.25` missed enumeration fix | `AIKIDO-2026-906996` (OTP existence leak, fixed `1.6.26`; OTP route not mounted today so low exposure but future `emailOTP` re-exposes) |
| `next` | `root ^16.3.5` vs `apps/app 16.2.12` | `<16.3.3` advisories open | Snyk `<16.3.3` RCE `FileSystemCache.getFilePath` (Windows) + AVIF `sharp/libheif` — patched `16.3.3/15.5.24`; July-2026 batch `16.2.11` (DoS Server Actions `64641`, proxy bypass `64642`, SSRF rewrites `64645`, cache confusion `64648/64647`) already covered by `16.2.12` |
| `zod` | `4.4.3` | `__proto__` pollution | `AIKIDO-2026-500926` fixed `4.5.0` — bump `^4.5.0` |
| `prisma 7.9.1` → `deepmerge-ts 7.1.5` | transitive | — | `GHSA-ggr8-5vv4-36mx` (recursion 8.2) fixed `deepmerge-ts ≥8.0.0`; override until Prisma ships; `find-my-way 9.7.0` already fixes `c96f-x56v`/`92pp-h63` |
| `@better-auth/cli` | `1.4.22` vs runtime `1.6.x` | `prisma@5` peer vs `7.9` | Align to `1.6.26` |
| `biome` | `package.json ^2.4.10` vs `bun.lock 2.5.6` vs `biome.jsonc schema 2.5.6` | schema drift | Pin `^2.5.6` |
| `helmet 8.3.0` / `cors 2.8.6` / `express-rate-limit 8.6.1` | installed | unused/misconfigured | Wire explicitly |
| `eve 0.29.4` in `apps/app/package.json:25` | unused in app (types only via `api/app-router`) | bundle weight | Remove from app |
| `transpilePackages`/`serverExternalPackages` | `@prisma/client, pg` externalised — good | — | Keep; add `optimizePackageImports` |

**Required explicit hardening:** `create-app.ts` `app.enableCors({origin: trustedOrigins, credentials:true})` + `helmet({contentSecurityPolicy:{directives:{defaultSrc:["'none'"],frameAncestors:["'none'"]}}, crossOriginResourcePolicy:{policy:"cross-origin"}, hsts:isProd})`; `apps/app/next.config.ts` `headers()` CSP/HSTS; `@nestjs/throttler` on `/api/auth/*` + sensitive TRPC; consider `better-auth rateLimit.secondaryStorage → Redis` (`apps/api/src/cache/cache.module.ts` already `KeyvRedis`).

---

## 7. Prioritised Execution Plan

### Lane P1 — Security & Correctness (week 1) — **no dependencies**

Owner: security lane. Validate: `bun audit`, `next build`, `turbo check-types`, manual `timingSafeEqual` trace, `auth:generate`.

| # | Task | File:line | Change | Verify |
|---|---|---|---|---|
| P1-1 | Remove hardcoded SIP credential | `nonoh-sip.ts:18` | `if(!process.env.NONOH_PASSWORD) throw` + `IsString MinLength(16)` | `grep -r NO2026` 0 hits |
| P1-2 | Fix open proxy | `app/api/[...path]/route.ts:14` | allow-list paths, `auth()` guard or `x-forwarded-host` check, 1MB body cap, `ContextLogger` | `turbo test` + manual unauthed 401 |
| P1-3 | Global rate-limit + explicit CORS | `create-app.ts:18`, `app.module.ts:28`, `auth.ts:61` | `ThrottlerModule.forRoot({ttl:60_000,limit:30})` strict `limit:5` on `sso.register`/`workspace.setMemberRole`; `enableCors({origin: trustedOrigins})` | k6 60rps probe 429 |
| P1-4 | Harden env validation | `env.validation.ts:104`, `eve.ts:44`, `crm.ts:11`, `voice.ts:90` | `AGENT_BRIDGE_SECRET MinLength(32)`, unify fail-closed when unset | `bun --filter=api check-types` + boot without env fails closed |
| P1-5 | Constant-time auth | `voice.ts:88`, `sync.controller.ts:55` | `timingSafeEqual(Buffer.from(a),Buffer.from(b))` full-length, no early-len return | unit: `sync.controller` timing oracle test |
| P1-6 | Pin/align deps | root + `apps/*/package.json` | `bun update better-auth@1.6.26 next@16.3.5 zod@4.5.0`; overrides `deepmerge-ts ^8.0.1`; `@better-auth/cli@1.6.26`; `biome ^2.5.6` | `bun.lock` diff, `next build` green, `prisma generate` ok |
| P1-7 | CSP/HSTS headers | `next.config.ts:11`, `create-app.ts:18` | `headers()` snippet below; `helmet` directives | `curl -I` shows CSP/HSTS |

### Lane P2 — Performance Hotspots (week 2) — depends on P1-6

| # | Task | File:line | Change | Expected gain | Verify |
|---|---|---|---|---|---|
| P2-1 | Gmail batch + bulk | `gmail-sync.service.ts:239,259` | `p-limit(5)` batch `getMessage`, `createMany(skipDuplicates)`, single `groupBy+updateMany` per thread | tick 15–60s → <5s | `gmail-sync` integration test with nock 120 msgs |
| P2-2 | Trigram search | `search.service.ts:26`, `companies:475`, `contacts:529`, `deals:326` | `CREATE EXTENSION pg_trgm` + GIN indexes, `q.length<3` guard, 10s `TtlCache`/Redis | p95 <100ms | `EXPLAIN ANALYZE` uses GIN |
| P2-3 | Cursor pagination + facet fix | `list-input.ts:21`, `companies:503` etc | cursor `{id, createdAt}` + `FOLLOWING: cursor+skip1`, facet key = `hash({q, filters})`; cap `page<=100` | deep page 1000 2s → 80ms | tRPC `list` e2e `page 1000` |
| P2-4 | User scan cache | `google-match.service.ts:55`, `gmail-sync:226`, `calendar-sync:74` | `TtlCache 5m` or `member findMany where organizationId` | O(users) removed | sync tick profile |
| P2-5 | Singleton Intl + render fixes | `format.ts:14`, `record-sheet-host.tsx:14`, `use-mobile.ts:6` | module singletons; `useEffect` not render `setState`; `useSyncExternalStore` | -GC, no CLS | `packages/ui` vitest + LH CLS |
| P2-6 | Bundle trim | `chart.tsx:5`, `agent-panel.tsx:48`, `next.config.ts:11` | `optimizePackageImports`, per-icon carbon imports, `dynamic(recharts, {ssr:false})`, remove `eve` from app | -45kB gz | `next build --analyze` |
| P2-7 | Calendar + mirror concurrency | `calendar-sync:313`, `image-mirror:62`, `backfill 247`, `favicon:56` | `Promise.allSettled` + `p-limit(5)`, streaming `content-length` check, `MAX_BYTES` cap | 10x mirror | `image-mirror` e2e |
| P2-8 | Dashboard SQL + cache | `dashboard.service.ts:67,39` | move trend to `date_trunc`+`sum`, Redis `KeyvRedis` key `${userId}:${scope}` with invalidation on deal/activity write | 6 queries → 2 | `dashboard` summary test |

### Lane P3 — Reliability & Hygiene (week 3) — parallel to P2 where noted

| # | Task | File:line | Change |
|---|---|---|---|
| P3-1 | Facet + deals owner bug | `companies:503` etc, `deals:336` | hash key + `ownerId: null` for `_unassigned` |
| P3-2 | Locks + transactions | `workspace.service:217`, `activity-stamp:78` | advisory locks or split `$transaction`s; index `(organizationId, role)` |
| P3-3 | Task atomicity + collapsing | `tasks.ts:62`, `pool.ts:9`, `MAX_ATTEMPTS 3` | `upsert` dedupe, `Set` for collapsing, jittered backoff |
| P3-4 | Telegram fail-closed + logging | `telegram.ts:156`, `dispatch.ts:39` | `if(!TELEGRAM_USERID) return false` + structured logger |
| P3-5 | Blob/favicon backpressure | `blob.ts:64`, `favicon:56`, `safe-fetch:171` | `content-length` pre-check, `AbortController`, `readCapped` streaming |
| P3-6 | Proxy Edge cache | `proxy.ts:27` | memoize `readOnboardingGate` 10s (Edge `unstable_cache`) |
| P3-7 | Env centralisation | `packages/env/src/index:87`, `capabilities.ts:11` | single Zod schema shared api+agent |
| P3-8 | Streaming boundaries | `app/(app)/page.tsx:29` | `loading.tsx/error.tsx` + `Suspense` per segment; remove `await Promise.all(prefetch)` blocking |

---

## 8. Implementation Guide (copy-ready)

### 8.1 Gmail — `gmail-sync.service.ts:239`

```ts
import pLimit from "p-limit";
const limit = pLimit(5);
const raw = await Promise.all(batch.map(id => limit(() => gmail.getMessage(id))));
const normalized = raw.map(toMessageRow);
await db.message.createMany({ data: normalized, skipDuplicates: true });
const byThread = groupBy(normalized, "threadId");
await db.$transaction(
  Object.entries(byThread).map(([threadId, msgs]) =>
    db.thread.update({ where:{id:threadId}, data:{ messageCount:{increment: msgs.length} } })
  )
);
```

### 8.2 Search — `search.service.ts:26` + SQL

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX company_name_trgm ON "company" USING gin (name gin_trgm_ops);
CREATE INDEX company_domain_trgm ON "company" USING gin (domain gin_trgm_ops);
CREATE INDEX contact_name_trgm ON "contact" USING gin (name gin_trgm_ops);
CREATE INDEX contact_email_trgm ON "contact" USING gin (email gin_trgm_ops);
```
```ts
if (term.trim().length < 3) return {companies:[],contacts:[],deals:[]};
const key = `search:${term}:${viewerId}`; const hit = await cache.get(key); if(hit) return hit;
// then Promise.all findMany take:5 — now GIN-indexed
```

### 8.3 Pagination — `trpc/list-input.ts:21`

```ts
export function cursorPaginate(input:{cursor?:string; take:number}) {
  const take = Math.min(Math.max(input.take, 1), 100);
  const cursor = input.cursor ? {id: input.cursor} : undefined;
  return { take: take+1, cursor, skip: cursor?1:0 };
}
// facet key
const facetKey = `facet:${hash({q, industry, owner, stage, closing, type})}`;
```

### 8.4 Headers — `apps/app/next.config.ts:11` + `apps/api/src/create-app.ts:18`

```ts
// next.config.ts
experimental:{ optimizePackageImports:["@carbon/icons-react","recharts"] },
images:{ formats:["image/avif","image/webp"], remotePatterns:[{hostname:"**.blob.vercel-storage.com"}] },
async headers(){ return [{source:"/(.*)", headers:[
  {key:"Content-Security-Policy", value:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self' https://*.blob.vercel-storage.com; frame-ancestors 'none'"},
  {key:"X-Frame-Options", value:"DENY"},
  {key:"X-Content-Type-Options", value:"nosniff"},
  {key:"Referrer-Policy", value:"strict-origin-when-cross-origin"},
  {key:"Permissions-Policy", value:"camera=(), microphone=(), geolocation=()"},
  ...(process.env.NODE_ENV==="production"?[{key:"Strict-Transport-Security", value:"max-age=31536000; includeSubDomains; preload"}]:[])
]}];}
```
```ts
// create-app.ts
app.enableCors({ origin: trustedOrigins, credentials:true, methods:["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowedHeaders:["content-type","authorization","x-request-id"] });
app.use(helmet({ contentSecurityPolicy:{ directives:{ defaultSrc:["'none'"], frameAncestors:["'none'"] } }, crossOriginResourcePolicy:{policy:"cross-origin"}, hsts: isProd }));
```

### 8.5 Deps — root

```json
{ "overrides": { "deepmerge-ts": "^8.0.1" } }
```
```bash
bun update better-auth@1.6.26 @better-auth/sso@1.6.26 @better-auth/cli@1.6.26 next@16.3.5 zod@4.5.0 --filter='*'
# then
bun run --filter=db generate
bun run --filter=auth generate
```

### 8.6 Format singleton — `packages/ui/src/lib/format.ts:14`

```ts
const NF_USD = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const DF = new Intl.DateTimeFormat("en-US",{dateStyle:"medium"});
export const formatMoney = (v:number)=> NF_USD.format(v);
```

### 8.7 Constant-time — `voice.ts:88` / `sync.controller.ts:55`

```ts
import { timingSafeEqual } from "node:crypto";
function safeEq(a:string,b:string){ const A=Buffer.from(a),B=Buffer.from(b); if(A.length!==B.length) return false; return timingSafeEqual(A,B); }
```

---

## 9. Verification & Gates

| Gate | Command | Must pass |
|---|---|---|
| Types | `turbo check-types` | zero errors |
| Build | `turbo build` (`next build --analyze` for app) | bundle -45kB; no viewTransition warning |
| Tests | `turbo test` (api `gmail-sync`, `calendar-sync`, `workspace`, `dashboard`; agent `tasks`, `lookup`; app `onboarding-gate`, `eve-proxy`, `agent-bridge`) | all green incl new timing/rate-limit/search specs |
| DB | `bun --filter=db prisma validate && prisma generate` + `EXPLAIN ANALYZE` on search/pagination | GIN used, no seq scan on `name` |
| Security | `bun audit` + `grep -r NO2026` 0 + `curl -I` CSP/HSTS + k6 429 on `/api/auth/*` | advisories cleared, 401 on unauthed proxy |
| Runtime | `turbo dev` + Gmail 120-msg nock tick <5s, search 60rps p95 <100ms, dashboard 200-row <150ms | profiled |

`turbo.json` `globalPassThroughEnv:23` already correct (secrets not cache keys); `build.env:90 [API_URL,APP_URL,NEXT_PUBLIC_API_URL]` inlined — keep.

---

## 10. Expected Impact

| Dimension | Before → After |
|---|---|
| **Performance** | Gmail tick 60s→<5s, deep page 2s→80ms, search 400ms→<100ms, dashboard 6q→2q, JS loop removed, Edge TTFB -50ms, bundle -45kB gz |
| **Security** | Closes CRITICAL + 2 HIGH (proxy/rate-limit/enumeration); retires 3 published CVEs (better-auth `AIKIDO-2026-906996`, next `<16.3.3` RCE/AVIF, zod pollution) + GHSA `ggr8-5vv4` via override |
| **Reliability** | Facets correct under filters, `owner _unassigned` fixed, no stale divergent cache, no TOCTOU task duplicates, telegram fail-closed, blob OOM prevented |
| **Maintainability** | Single env Zod, deduped list query helper, central config for limits, proper streaming boundaries, explicit CORS/HSTS docs |

---

## 11. Risks & Rollback

- `next 16.3.5` may shift App Router `proxy`/`headers()` semantics — verify with `next build` + `CVE-2026-64642` bypass test (auth must be in server components not only Edge).
- `pg_trgm` extension needs `CREATE EXTENSION` privilege — on managed Postgres (Vercel/Neon) may require dashboard toggle; fallback is `ILIKE` without GIN (perf only).
- `deepmerge-ts` override is temporary — track `prisma#30052`, drop when `prisma>7.9.1` ships `8.0`.
- Throttling may false-positive on bulk import — exclude `POST /internal/sync/*` (already `CRON_SECRET`-gated) from `ThrottlerGuard`.

Rollback: pin `next 16.2.12` + `better-auth 1.6.25` + remove overrides; revert `list-input` to offset for one release if cursor regression observed; feature-flag facet cache off.

---

## 12. Appendix — Evidence Index (scan hits)

- API perf: `gmail-sync:239,259` / `calendar-sync:313,352,74` / `google-match:55` / `search:26` / `list-input:21` / `companies:107,137,192,503` / `contacts:127,355,555` / `deals:95,336,358` / `workspace:172,217,264` / `dashboard:39,67,177` / `image-mirror:62` / `activity-stamp:78` / `sql-scanner:39` / `model-catalog:70` / `agent-trigger:208` / `cache:53` / `conversations:30`
- App: `record-sheet-host:14` / `format:14` / `agent-panel:48,504` / `chart:5,93` / `next.config:11` / `use-mobile:6` / `page:29` / `proxy:27` / `route:14,50` / `lib/{agent-bridge:20,trpc,cache}` / `auth:61`
- Agent/DB: `web-search:458` / `lookup:101` / `pool:9,48` / `dispatch:39` / `tasks:62,129` / `capabilities:11` / `channels:{telegram:156,voice:88,eve:44,crm:17}` / `safe-fetch:168` / `blob:64` / `favicon:56` / `env:87,171` / `portrait-sources:125` / `linkdapi:248` / `context-dev:86` / `egress-guard:18` / `workspace:196` / `schema:878`
- Reusable sessions: `exp-2/ses_f5aa4b00affeAK3mhljT2rCm1Z`, `exp-3/ses_f5aa4aff6fferX6jfs2SMvVZpl`, `lib-1/ses_f5aa4afd1ffee9v2UBJ2geUWwb`

---

*Next action:* approve P1 lane, then execute tasks in order; file issues for P2/P3 with `path:line` labels. Keep this doc at repo root and link from `AGENTS.md`.
