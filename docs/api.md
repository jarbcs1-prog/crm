
# API Rules - Always review when working on our API

## Logging: use the Nest logger, attach fields, never `console.log`

Logging lives in `apps/api/src/logging`. `ContextLogger` extends Nest's
`ConsoleLogger` and is installed in `main.ts`, so `new Logger(Thing.name)`
anywhere in the app picks it up. **Format and level are not configurable** —
they follow `NODE_ENV`: JSON at `log` and above in production, colourised with
`debug`/`verbose` locally.

- **Attach data as one object, not extra arguments.** Nest prints one line per
  argument, so `logger.log("Saved", { userId })` emits two lines. Write
  `logger.log({ message: "Saved", userId })` instead — the fields are hoisted to
  the top level in JSON and rendered after the text in development.
- **Errors pass the stack as the second argument**:
  `logger.error({ message: "…" }, error instanceof Error ? error.stack : String(error))`.
  Handing Nest the error object instead prints it as a second message and drops
  the trace.
- **Every request carries a `requestId`**, generated (or taken from an inbound
  `x-request-id`) by `RequestLoggerMiddleware`, returned on the response header,
  included in error bodies and stored in `AsyncLocalStorage` so every log line
  during that request is correlated. `UserContextInterceptor` adds `userId` once
  the auth guard has resolved the session.
- **Better Auth routes are logged through its `middleware` option**
  (`BetterAuthModule.forRoot({ auth, middleware: logAuthRoute })`). It mounts its
  handler straight onto the HTTP adapter during module configuration, before
  Nest applies anything from `MiddlewareConsumer`, so `/api/auth/*` would
  otherwise never reach the middleware. `LoggingModule` must stay **first** in
  `AppModule`'s imports for the same reason.
- **Never log headers, query strings or request bodies.** They routinely carry
  session cookies and personal data. Log the specific fields a handler knows are
  safe.
- **Prisma statement logging is opt-in** via `PRISMA_LOG_QUERIES=true` and is
  emitted at `debug`. It is off by default because it buries every other line
  under a wall of `SELECT`s. Bound parameters are dropped even when it is on.
  Prisma warnings and errors always flow through the app logger via
  `PrismaLogBridge`; outside the API (seeds, scripts, the Next.js app) they fall
  back to the console sink in `packages/db/src/client.ts`.

## Intelligence never lives in the API

This is an **agentic-first platform**. The API serves HTTP, auth, tRPC and the
Google sync. It does not research, enrich, score, summarise, match identities or
decide anything about a person or a company — not as a fallback, not "just the
cheap bit", not behind a flag. That work belongs to the eve agent in
`apps/agent`, which owns the vendor clients, the confidence model and the
writes.

Nest's half of the contract is to **report that something happened** — a thread
was ingested, a company was created, an attendee is unknown — and let the agent
decide what it means. A Nest service that calls an enrichment API is a bug, and
the reason is in the tree: two identity matchers were copied across `apps/api`
and `apps/agent` and the copies silently drifted until one of them matched
every employer on earth. See
[`docs/plan/contact-intelligence-agent.md`](./plan/contact-intelligence-agent.md).

`apps/api/src/enrichment/` is gone. What replaced it is
`apps/api/src/agent/agent-trigger.service.ts` — one service with one verb, which
writes an `AgentTask` row saying *this happened* and why it might matter. A row
rather than an HTTP call: the agent leases work from that table already, so the
row *is* the message and it survives the agent being down, redeployed, or
slower than the request that produced it.

If you are about to add a vendor client to `apps/api`, you want
`apps/agent/agent/lib` instead.

## There is exactly one organization and it is not a tenancy boundary

This is an internal tool behind Google sign-in and it is **single tenant**.
There is no `x-organization-slug` header, no org context interceptor, no
org-scoped cache keys and **no `organizationId` on any CRM record**. A company,
a contact, a deal and an activity are scoped by nothing, because there is
nothing to scope them to.

What does exist is a **singleton workspace**: the Better Auth `organization`
plugin, holding one row whose id is the literal string `workspace`
(`WORKSPACE_ID`, defined in [`@crm/db`](../packages/db/src/workspace.ts) and
re-exported by `@crm/auth` — the agent reads workspace rows and does not depend
on the auth package and one id must not be two strings). It is there to answer
three questions a CRM has to answer about *itself* — what is this company
called, who works here and what do we sell — and for nothing else.

- **The id is a constant, never a parameter.** Every read says
  `where: { id: WORKSPACE_ID }`. The moment a function takes an
  `organizationId`, the plugin has become tenancy plumbing and the rule above
  is broken. If you are porting something from the Comp AI MVP, delete the org
  threading rather than stubbing it — an `organizationId` that is always the
  same value is a column, an index and a `where` clause that buy nothing.
- **Signing in is the join and there is no invite flow.**
  `ensureWorkspaceMembership` runs in `databaseHooks.session.create.before`, so
  the workspace and the caller's `Member` row exist by the time any request is
  served. `ALLOWED_SIGN_IN` already decides who may sign in; an invitation
  would be a second, quieter answer to the same question. The plugin's
  `invitation` table is created because the plugin owns its own schema — it is
  unused and nothing in this repo writes to it.
- **The first account is the owner; everyone after is a member.** When the
  workspace row is created the hook enrols *every user that already exists*,
  oldest first as owner — otherwise an install that predates the plugin shows
  an empty Members page until each person happens to sign in again, which looks
  identical to being broken.
- **`ensureWorkspaceMembership` degrades, it does not throw.** A failure there
  would fail the session create, which is to say it would lock everyone out of
  the CRM to protect a settings page. It logs, returns `undefined` and the next
  sign-in retries — the hook runs on every session, so it is self-healing.
- **Permissions are read from one place.** `canRenameWorkspace` and
  `canChangeRole` in `@crm/auth` are what the service enforces *and* what the
  UI disables its controls on, so the button and the 403 can never disagree.
  They match the plugin's own default statements — owner and admin — rather
  than inventing a second model beside it. `WorkspaceService` adds the one
  invariant the plugin has no opinion about: **the last owner cannot be
  demoted.** It is enforced in a transaction that takes `FOR UPDATE` on the
  owner rows before counting them, because counting and then updating is two
  statements: two admins demoting the two remaining owners at the same moment
  both counted two and both wrote and a workspace with no owner is a workspace
  nobody can rename or hand back. The lock makes the second one read the first
  one's result and refuse.
- **Reads and writes go through tRPC, not `authClient.organization.*`.**
  Renaming the workspace is data, not authentication, so it belongs on the data
  surface with everything else — see the next rule.
- **The name and the website are asked for once, at the door and there is no
  skipping it.** Both fields are `required` in the form *and* in
  `updateWorkspaceInput`, so the website cannot be dropped later from the
  settings page either — a CRM that knows what we sell on Monday and not on
  Tuesday is worse than one that never knew. The gate only catches somebody who
  could *answer* it (`canRename`), so a member never meets a form they are
  forbidden to submit and it posts the same `workspace.update` mutation as the
  settings page rather than a second write path.
- **The state is `onboardedAt` inside the organization's `metadata`, not a
  column beside it.** The plugin ships that blob and owns the table; a second
  timestamp column is a second place the same fact is recorded and the two
  drifted the first time somebody wrote a website through a revision of
  `WorkspaceService.update` that predated the column. A row with a name, a
  website and a null timestamp is a workspace that has plainly answered the
  question and is asked it forever. `isOnboarded` and `markOnboarded` in
  [`@crm/db/workspace`](../packages/db/src/workspace.ts) are the only readers
  and the only writer; `markOnboarded` keeps the first answer and preserves
  every other key, because the blob is the plugin's, not ours.
- **The gate is `proxy.ts` and it is answered once per browser.** It used to
  live in `(app)/layout.tsx`, which meant a `workspace.get` round trip on every
  navigation into the app to re-establish a fact that changes once in the life
  of an install — and a second, opposing redirect on the `/onboarding` page to
  stop the first one looping. Two redirects pointing at each other is not a
  gate, it is a latch waiting for the two reads to disagree.
  - **`getSessionCookie()` decides signed-in, not a session lookup.** That is
    Better Auth's documented optimistic check for proxy and it is all a
    redirect needs; every page behind it still resolves the real session
    server-side through `requireGoogleAccess()`.
  - **The answer is cached in an httpOnly `crm.onboarded` cookie**, so the
    common path costs nothing and the tRPC read happens once — twice for the
    person who actually fills the form in, since the cookie lands on the
    navigation after the mutation. The proxy is the only writer; the form does
    not set it, because two writers is how this went wrong in the first place.
    Forging the cookie skips a setup form and grants nothing, which is why it
    can be a cookie at all.
  - **`/sign-in`, `/grant-access` and `/eve` are ungated.**
    `requireGoogleAccess()` redirects to `/grant-access`, so gating it would
    ping-pong against the onboarding redirect for anyone who signed in without
    both scopes.
  - **An unreachable API fails open.** `readOnboardingGate` returns `unknown`
    on a non-200, a timeout or a parse failure and an unknown gate lets the
    request through without writing the cookie. The alternative is an install
    that cannot reach its own API redirecting every request to a form that
    cannot be submitted.
- **The name arrives as a placeholder, not as an answer.** A workspace is
  created as `DEFAULT_WORKSPACE_NAME` — the literal string `CRM` — and the field
  is empty with that behind it. It used to be derived from the sign-in domain,
  which put `Trycomp` in the box as though somebody had typed it and a guess
  presented as an answer is a guess that gets accepted.
- **The website is the field with a consequence.** Saving it queues the agent's
  `workspace-profile` task and what comes back is read into the opening context
  of every session the agent runs — see
  [the agent's rules](./agent.md#every-session-also-knows-who-we-are). The API
  writes the row and decides nothing about it, which is what keeps this on the
  right side of the first rule in this file.
- **It is a hostname and `normalizeDomain` is the one thing that says so.**
  `WorkspaceService.update` runs the field through the same helper a company's
  domain goes through (`apps/api/src/companies/domain.ts`) and rejects what
  comes back null, so the message about entering `acme.com` is now true — it
  used to strip `https://` and a trailing slash and store whatever was left,
  which meant a typed sentence was accepted, marked the workspace onboarded,
  and sent the agent to research a website that does not exist. A second
  hostname rule beside that helper would be a second answer to one question.
  The value is stored canonical (lower case, no `www.`, no path), so saving a
  website that was previously stored uncanonically counts as a *change*: the
  existing `WorkspaceProfile` stops matching and is dropped by `profileOf`, and
  the same save queues the research that replaces it. That is the intended
  order — a profile that no longer matches the website is a description of the
  company we used to be.

## SSO is a row, not a deployment

Google is the sign-in method a clone starts with. An install that has its own
identity provider adds one on **Settings → SSO** and the whole of that
configuration is an `ssoProvider` row written by Better Auth's
[`sso` plugin](https://www.better-auth.com/docs/plugins/sso) — not an
environment variable, because a self-hoster's admin cannot redeploy.

- **OpenID Connect only.** `apps/api/src/sso` registers a provider from an
  issuer, a client id and a client secret; everything else — the authorization,
  token, JWKS and userinfo endpoints — is read from the issuer's discovery
  document at registration time. The plugin can do SAML as well and there is
  deliberately no UI for it: SAML needs an X.509 certificate and an SP signing
  key this app has nowhere to generate or keep and a half-configured SAML
  provider fails at the IdP with an error nobody here can read.
- **The provider belongs to the workspace and the id is still a constant.**
  `SsoService` passes `WORKSPACE_ID`; it is never an input. That is also what
  gives the plugin's own `sso/register` its permission check for free, and
  `canConfigureSso` in [`@crm/auth`](../packages/auth/src/sso.ts) is the second
  half — the same owner-or-admin answer the settings page disables its button
  on, beside `canRenameWorkspace`.
- **The management surface is tRPC; signing in is not.** Listing, adding and
  removing a provider is configuration, so it goes through `sso.*` like every
  other read and write. `authClient.signIn.sso()` stays on the auth client,
  because that one *is* authentication.
- **`sso.signInOptions` is the one public procedure in the app.** The sign-in
  page is unauthenticated and has to know what it may offer, so it returns each
  provider's id and the name to print on the button, plus whether a Google
  client is configured at all — nothing else. `sso.list` carries the issuer, the
  domains and the last four of the client id and it — like `sso.settings`,
  `sso.register` and `sso.remove` — takes `AuthMiddleware` at the method rather
  than the router, which is what leaves `sso.signInOptions` open. A client
  secret is never read back out of any of them.
- **It is the API's answer, not the app's.** Both processes read one `.env`, but
  `/api/auth/*` is served by the API, so whether Google sign-in works is a fact
  about *its* environment. The app asking itself would be right until the day
  the two are deployed with different configuration and then it would offer a
  button that 500s.
- **An install with neither says so.** No Google client and no provider is not
  an empty sign-in page: it is the one state where the reader is the person who
  can fix it, so `/sign-in` names the two variables to set. A read that *fails*
  is different and must not print that — an unreachable API is not a missing
  configuration, so the page falls back to offering Google.
- **A configured provider replaces the Google button, it does not disable
  Google.** `/sign-in?method=google` still offers it. Hiding is the point —
  locking an admin out of their own CRM because they typed an issuer URL wrong
  is not. It only offers it when there *is* a Google client, so the escape hatch
  is never a button that cannot work.
- **Signing in with an IdP does not cost you Gmail.** Google is two separate
  things here — a way to prove who you are and a mailbox to read — and an
  install that replaced the first still wants the second. So Gmail and Calendar
  are a *connection* for an SSO rep, not a condition of entry: `needsGoogleGrant`
  in [`@crm/auth`](../packages/auth/src/scopes.ts) walls only an account whose
  sole sign-in row is Google and Settings → Connections carries the button that
  links one. See [the sync rules](./environment.md#gmail-and-calendar-sync).
- **`ALLOWED_SIGN_IN` still decides who gets in.** SSO says where someone
  authenticates; the allow-list says whether that address may have an account,
  and `databaseHooks.user.create.before` enforces it on an SSO sign-up exactly
  as it does on a Google one. Two questions, one answer each.
- **The plugin does not do the workspace join.**
  `organizationProvisioning: { disabled: true }`, because
  `ensureWorkspaceMembership` already runs on every session create. Two things
  enrolling the same person is two things to keep in step.

## tRPC is the data surface; REST is for auth and health

Everything the app reads or writes goes through `nestjs-trpc` routers under
`/api/trpc`, wired in `apps/api/src/trpc`. The remaining REST controllers are
`/api/auth/*` (Better Auth) and `/health`.

- **One router per module**, named `*.router.ts` so the codegen glob finds it,
  carrying `@Router({ alias: "…" })` and `@UseMiddlewares(AuthMiddleware)`.
  A router with no `AuthMiddleware` is public — there is no other guard.
- **Routers are thin.** They validate input with zod and call a service; the
  Prisma work lives in `*.service.ts`, which is also where a REST controller or
  a background job would call in.
- **Services throw Nest's `HttpException` family** (`NotFoundException`,
  `BadRequestException`, …). `DomainErrorMiddleware` maps those onto tRPC error
  codes, so a service does not need to know it is being called over tRPC.
- **Filtering, sorting and pagination happen in Prisma.** List procedures take
  the shared `listInput` (`apps/api/src/trpc/list-input.ts`) and return
  `{ rows, total, facetCounts }`. Never return a whole table and filter in the
  browser and never interpolate `sort` into a Prisma field name — resolve it
  through `resolveOrderBy` against the columns that module allows.
- **The router type is generated**, not hand-written:
  `bun run --filter=api trpc:generate` writes `src/generated/server.ts`, which
  the app imports as `type { AppRouter } from "api/app-router"`. `bun run dev`
  keeps it in watch mode. If the app cannot see a new procedure, the generator
  has not run.
- **`src/generated/server.ts` is committed and `build` must never regenerate
  it.** The generator ships a native binary that needs GLIBC 2.39 — newer than
  Vercel's build image — so a `build` task that depends on `trpc:generate` fails
  every deploy. That is why `apps/api/.gitignore` ignores `src/generated/*` with
  a `!src/generated/server.ts` exception and why only `check-types` and `dev`
  run the generator. Regenerate locally and commit the result with the router
  change that caused it.

## Freshness: invalidate the query, don't disable the cache

There is no HTTP response cache in front of tRPC. Freshness is TanStack Query's
job: a mutation invalidates the query keys it affected and the list refetches.

- **Invalidate on the client, in the mutation's `onSuccess`** — but **through
  `useCrmCache()`** (`apps/app/lib/trpc/cache.ts`), not by listing keys at the
  call site. Say *what changed* (`cache.deal(id)`, `cache.company(id)`,
  `cache.contact(id)`, `cache.activity()`) and the module owns the fan-out. Twelve
  hand-written key lists is how they drifted: a stage change did not refresh the
  timeline entry it writes, creating a deal did not refresh the board and nothing
  refreshed the overview, so a rep could close a deal and watch their own numbers
  not move. **A new mutation adds a call there, not a new list of keys.**
- **Pass `{ settle: "record" }`** when the caller is an inline editor. The
  default waits for every affected view to refetch, which is right when the point
  of the action *is* the view changing (a card moving between board columns);
  `"record"` waits only for the edited record so the field's spinner clears as
  soon as the value under it is right and lets the table behind the sheet catch
  up on its own.
- **An infinite query needs `pathKey()`, not `queryKey()`.** tRPC stamps the
  query type into the key, so `queryKey()` yields `{ type: "query" }` and
  `infiniteQueryOptions` caches under `{ type: "infinite" }` — the two cannot
  partially match and invalidating with the wrong one is silent: it reports
  success, refetches the sibling non-infinite queries and leaves the infinite
  one stale until a reload. `pathKey()` carries no type and matches both, which
  is what you want whenever a procedure is read both ways (`activities.timeline`
  is, as a paged history and as a pinned top-ten).
- **`cache-manager` is still there** (`apps/api/src/cache`, Redis when
  `REDIS_URL` is set) but it is used deliberately, per value, by services that
  want it — `AuthService.getProfile` is the model: read through, write on miss,
  and an explicit `invalidateProfile` on change. It is not a global interceptor,
  so nothing is cached unless a service asks for it.
- **Background writes the browser cannot see** — enrichment finishing, most
  obviously — are not invalidations at all, because no client action caused
  them. Poll for those: `refetchInterval` while the record's status is
  `PENDING`/`RUNNING` and stop once it settles. Use `isEnriching()` and
  `ENRICHMENT_POLL_MS` from `components/crm/enrichment-status` so the rule is one
  definition. **A list polls too, not just the record sheet** — the company sheet
  polled and the companies table did not, so a newly added company's logo and
  industry appeared in the sheet and stayed blank in the table behind it until a
  reload.
