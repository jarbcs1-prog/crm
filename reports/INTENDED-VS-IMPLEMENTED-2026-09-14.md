# Intended vs. Implemented — Audit of the Gap

**Date:** 2026-09-14
**Scope:** F:\crm — trust-boundary, permission and egress claims in the documentation set
vs. their enforcement in code.
**Method:** Read the documentation set as claims to verify; cite a file:line enforcement
point (or its provable absence) for each; classify by whether crossing the gap lets a
real actor reach data, money, infrastructure, or another tenant they shouldn't.

**Documentation set treated as intent (source of truth):**
- `SECURITY.md` — trust model, secrets, egress
- `docs/api.md` — architecture, tRPC surface, SSO, workspace/roles, "intelligence never
  lives in the API"
- `docs/design.md` — UI rules (no security boundary; verified consistent, no finding)
- `docs/agent.md` / `apps/agent/agent/skills/data-boundaries.md` — agent read/write/egress
  rules

---

## Findings

### F-1 — MEDIUM — `SECURITY.md` says "no roles"; a role model is enforced in code

**Documented intent (SECURITY.md:15):**
> "There are no roles, no per-record permissions and no organizations — deliberately,
> because a permissions check that always returns `true` reads like a real one at review
> time."

**Implemented reality:** A role model exists and is enforced.
- `packages/auth/src/organization.ts:11` `WORKSPACE_ROLES = ["owner","admin","member"]`;
  `:19` `isWorkspaceAdmin`, `:23` `canRenameWorkspace`, `:27` `canChangeRole`.
- `packages/auth/src/sso.ts` `canConfigureSso` (owner/admin).
- Enforced at: `apps/api/src/workspace/workspace.service.ts:122` (rename),
  `:197`/`:241` (remove/change role), `apps/api/src/sso/sso.service.ts:306`
  (`requireConfigurer`), `apps/api/src/settings/settings.service.ts` (agent-model gate,
  L-04 fix).
- `docs/api.md:106-117` and `:209-211` document this exact model in detail — so the two
  intent docs **contradict each other**: `api.md` is correct, `SECURITY.md` is stale.

**Attacker / victim:** No direct exploit — the code is *more* restrictive than the doc
claims. The risk is audit integrity: a developer who trusts `SECURITY.md` may add a
feature assuming "no roles exist" and omit a check where one is expected, or a reviewer
may dismiss a missing check as intentional. The skill explicitly warns:
"undocumented-but-enforced … flag it: the docs are now stale, which weakens the next
audit."

**Concrete fix:** Rewrite `SECURITY.md:15` to state the real model: single-tenant, no
per-record permissions, but a workspace-admin role model (owner/admin/member) governs
*workspace administration only* — rename, role changes, member removal, SSO config, agent
model. CRM record access stays open to every signed-in member. Reconcile with `api.md`.

---

### F-2 — LOW — Ownership bootstrap diverges from `api.md` ("first account is owner")

**Documented intent (docs/api.md:97-101):**
> "The first account is the owner; everyone after is a member. When the workspace row is
> created the hook enrols *every user that already exists*, oldest first as owner …"

**Implemented reality:** `packages/auth/src/organization.ts:90-115`
(`ensureWorkspaceMembership`): if `ownerEmails().size > 0` (the `OWNER_EMAILS` env var
added in the M-02 review fix), the owner is whoever's email matches `OWNER_EMAILS`; only
when no match exists does the first user become owner. When `OWNER_EMAILS` is unset, the
first user is owner — matching the doc. `OWNER_EMAILS` is documented in `.env.example`
but **not** in `api.md`.

**Attacker / victim:** Benign. On a fresh install with `OWNER_EMAILS` set, the owner is
decided by email match, not signup order. A typo in `OWNER_EMAILS` silently falls back to
first-user-owner (acceptable fail-safe), but the operator's mental model ("first account
= owner") is wrong, which can mislead who holds owner.

**Concrete fix:** Document `OWNER_EMAILS` precedence in `api.md` (or a security note):
`OWNER_EMAILS` overrides first-user; first-user is the fallback when no match.

---

### F-3 — HIGH — Agent egress constraint is prompt-only, not code-enforced

**Documented intent (SECURITY.md:21):**
> "It is deliberately unrestricted on the *read* side and constrained on the *write* and
> *egress* sides — see `apps/agent/agent/skills/data-boundaries.md`."

**data-boundaries.md:23-28 (rule 1):** "No customer text in a third-party query.
`web_search`, `web_fetch` and `research_person` go to companies that are not us … never a
pasted thread, quote or sentence from a message."

**Implemented reality:** The egress rule is enforced **only by a prompt instruction**
(data-boundaries.md is a skill loaded into the agent). There is **no code-level filter**
that prevents `web_search` / `web_fetch` / `research_person` from receiving customer
text. The only code-level egress guard is `packages/db/src/safe-fetch.ts`
(`isBlockedAddress` / `resolvesToPublicHost`), which blocks *internal / loopback /
link-local* hosts — i.e. it stops the agent hitting your own network, but does **not**
stop it sending customer text to a *public* third party. (The write side is partially
code-enforced: `apps/agent/agent/lib/facts.ts` marks `email`/`phone` as `column: null`,
non-writable — so "constrained on the write side" is partly true; "constrained on the
egress side" is not, at the code layer.)

**Attacker / victim:** A prompt-injection delivered through an untrusted email — which
`SECURITY.md:21` acknowledges the agent reads "in full" — can instruct the agent to embed
customer text in a `web_search` / `research_person` call, exfiltrating PII (message
bodies, attendee lists) to a third party. The documented "constraint" would not stop it.
Victim: the CRM's customers whose private text leaks.

**Concrete fix (pick one, in increasing strength):**
1. *Minimum:* Correct `SECURITY.md` to state the egress constraint is prompt-level and
   depends on model compliance — not a hard boundary — and name the prompt-injection
   residual risk explicitly.
2. *Better:* Add a code-level egress sanitizer at the tool layer that strips
   message/thread-derived text from third-party queries (or refuses such queries when the
   prompt context contains CRM history).
3. *Strongest:* Route all third-party queries through a proxy that enforces the
   no-customer-text rule and logs violations.

**Status — partially closed (2026-09-14):** The *minimum* fix is done (`SECURITY.md`
now states the egress rule is prompt-level, not a hard boundary and names the
prompt-injection residual). The *better* fix is implemented for the in-repo leak
vector: `apps/agent/agent/lib/egress-guard.ts` (`guardThirdPartyQuery`) refuses
queries that look like mailbox/message content (email headers, forwarded markers,
quoted reply blocks, "On … wrote:" attributions) before they leave the process, and
`apps/agent/agent/tools/research_person.ts` calls it before querying Perplexity.
`apps/agent/test/egress-guard.spec.ts` (7 tests) locks this in. **Residual:** the
`eve` built-in `web_search` / `web_fetch` tools are framework-provided (not in this
repo) and remain prompt-guarded only; a full guard there needs framework-level work
(the *strongest* option). `research_company` is not a leak vector — it sends a
company's public website URL, not free-form text.

---

### F-4 — LOW — Undocumented unconditional egress from the API

**Documented intent (SECURITY.md:23):**
> "With no keys set, nothing leaves your infrastructure except Google's own APIs. That is
> the default."

**Implemented reality:** `apps/api/src/settings/model-catalog.service.ts:5,70` performs an
**unconditional** `fetch("https://ai-gateway.vercel.sh/v1/models")` (no env-key gate) from
the API to populate the model picker. It sends no user data (a GET for model names), but
it is a third-party egress not mentioned in `SECURITY.md` and not gated by any key.

**Attacker / victim:** Low. No PII leaves; only request metadata to Vercel. But the doc's
"nothing leaves your infrastructure except Google's own APIs" is false whenever the
settings page is opened, contradicting a privacy claim a deployer may rely on.

**Concrete fix:** Either document the model-catalog fetch in `SECURITY.md` (and soften the
"no keys = no egress" statement), or gate it behind an explicit opt-in / key.

---

## Verified — intent matches implementation (no gap)

These are the confirmations the method requires; each cites the enforcement point.

- **V-1 Sync route secret.** `apps/api/src/google/sync.controller.ts:40-49` — `@AllowAnonymous`,
  refuses when `CRON_SECRET` unset, constant-time bearer compare. Matches `SECURITY.md:25`.
- **V-2 Allow-list fails closed + covers SSO.** `packages/auth/src/auth.ts:104-122`
  (`user.create.before` enforces `isWorkspaceEmail`); `:128-139` (`session.create.before`).
  `packages/auth/src/workspace.ts:39-61` — empty `ALLOWED_SIGN_IN` → `hasSignInAllowList()`
  false → sign-in refused. Matches `SECURITY.md:17`, `docs/api.md:248`.
- **V-3 Single tenancy, no `organizationId` on CRM records.**
  `apps/api/src` references `organizationId` only on `member`/`ssoProvider` (Better Auth
  plugin); `packages/db/prisma/schema.prisma` confirms `Company`/`Contact`/`Deal`/`Activity`
  have none. `WORKSPACE_ID` constant used only for member/ssoProvider. Matches
  `docs/api.md:68-89`.
- **V-4 Exactly one public tRPC procedure.** `apps/api/src/sso/sso.router.ts:29-32`
  (`signInOptions`, no `AuthMiddleware`); all other routers carry `@UseMiddlewares(AuthMiddleware)`
  (grep of `*.router.ts`). Matches `docs/api.md:216-223,263`.
- **V-5 SSO client secret never returned.** `apps/api/src/sso/sso.service.ts:56-62,118-130`
  — `PROVIDER_SELECT` reads `oidcConfig` but `toProvider` returns only `clientIdLastFour`.
  Matches `docs/api.md:219-223`.
- **V-6 SSO issuer SSRF guard.** `apps/api/src/sso/sso.service.ts:194-207` validates scheme
  + `resolvesToPublicHost` (blocks private hosts). Matches L-03/M-12 intent.
- **V-7 Role checks centralized + mirrored in UI.** `packages/auth/src/organization.ts`
  (`canRenameWorkspace`/`canChangeRole`) is the single source; `workspace.service.ts:111-112`
  returns `canRename`/`canChangeRoles` to disable UI controls. Matches `docs/api.md:106-108`.
- **V-8 Last-owner demotion prevented.** `workspace.service.ts:211-226` and
  `organization.ts:50-62` take `FOR UPDATE` on owner rows before counting. Matches
  `docs/api.md:110-117`.
- **V-9 Intelligence lives in the agent, not the API.** No `TAVILY`/`EXA`/`BRAVE`/
  `FIRECRAWL`/`GOOGLE_API` calls in `apps/api/src`; only Google sync (intended) and the
  internal agent dispatch. Matches `docs/api.md:41-66`. (The model-catalog fetch, F-4, is
  config not intelligence.)

---

## Summary

| ID | Severity | Gap | Crosses boundary? | Status |
|----|----------|-----|-------------------|--------|
| F-1 | MEDIUM | `SECURITY.md` "no roles" is false; roles enforced | Audit integrity → future regressions | Closed (doc fixed) |
| F-2 | LOW | Ownership = `OWNER_EMAILS`, not "first account" | Correctness/doc of owner identity | Closed (doc fixed) |
| F-3 | HIGH | Agent egress constraint is prompt-only | PII exfil via prompt injection | Partial: doc fixed + in-repo guard on `research_person`; `web_search`/`web_fetch` (eve built-ins) still prompt-only |
| F-4 | LOW | API egress to Vercel not documented | Privacy-claim accuracy | Closed (doc fixed) |

**Headline:** The hard boundaries (sync secret, sign-in allow-list, single-tenancy, public
surface, SSO secret handling, role centralization, last-owner lock) are correctly
enforced and match their docs. The gaps were (1) `SECURITY.md` stale about roles, (2) the
agent's egress "constraint" advisory, not technical. Both are now addressed: `SECURITY.md`
and `api.md` corrected and a code-level egress guard backs the prompt rule for the
in-repo research tool. The only remaining residual is the framework-provided
`web_search`/`web_fetch` tools, which would need an `eve`-level change to harden.

**Recommended order (done):** F-3 (doc + in-repo code guard), F-1 (`SECURITY.md`),
F-2/F-4 (doc accuracy).
