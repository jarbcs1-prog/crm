# Next-Steps Execution Plan (post-optimization)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the committed optimization work, prove it with measurements, finish the deferred items, and add new model/voice providers to the research agent.

**Architecture:** Review-then-merge the `perf/optimization-plan` branch, validate the trigram migration on staging with `EXPLAIN ANALYZE`, re-measure every claimed win against its baseline, then extend the agent's provider surface following the existing `lib/voice.ts` + `lib/capabilities.ts` pattern.

**Tech Stack:** NestJS 11, Prisma 6 Postgres + pg_trgm, eve agent, Vercel AI Gateway, bun:test.

**Spec:** Prior turns — `optimization-execution-plan.md`, `PERF_BASELINE.md`, commit `59f2554`, and the five next steps listed after the app-build verification (3 tasks successful, 26s).

## Global Constraints

- Single root `.env` only, never per-package `.env`; every new variable goes in `.env.example` with a note, and API-read variables also go in `apps/api/src/config/env.validation.ts`.
- Agent-only keys (model endpoints, voice vendors) are NOT declared in `env.validation.ts` — that schema is the API's, not the repo's.
- Turbo runs in strict env mode: any variable a process reads must be declared in that package's `turbo.json` `passThroughEnv`.
- A missing key removes a capability, it never throws — follow `apps/agent/agent/lib/capabilities.ts` and `apps/agent/agent/lib/voice.ts`.
- No intelligence moves into the API; agent owns enrichment and voice decisions.
- Use Nest `Logger` with single-object fields in API runtime paths; agent boot/activity lines go to stderr.
- No code comments in written code.
- No coauthored commits.
- Measure before/after with the same command under the same conditions; keep only wins that exceed run-to-run variance and log kept and reverted attempts in `PERF_BASELINE.md`.

---

### Task 1: Push, review, and merge the optimization branch

**Files:**
- Modify: none (review only)
- Test: existing suites on the branch

**Interfaces:**
- Consumes: commit `59f2554` on `perf/optimization-plan`
- Produces: merged `master` with the 12 plan files

- [ ] **Step 1: Push the branch**

```bash
git push -u origin perf/optimization-plan
```

- [ ] **Step 2: Verify the full suite on the branch**

Run: `$env:NODE_OPTIONS=''; bun run --filter=api test`
Expected: 136+ pass, 0 fail (19 in the two new specs)

- [ ] **Step 3: Verify types and app build**

Run: `$env:NODE_OPTIONS=''; bun run check-types`
Expected: PASS across packages
Run: `$env:NODE_OPTIONS=''; bun run build --filter=app`
Expected: all routes compile, no `./client.js` error

- [ ] **Step 4: Open the PR and merge**

PR body notes the commit bundles pre-existing uncommitted edits to the same files, plus the kept/reverted ledger from `PERF_BASELINE.md`.
Expected: reviewer approval, squash or merge per repo habit, branch deleted after merge

---

### Task 2: Apply the trigram migration on staging and prove index use

**Files:**
- Modify: `packages/db/prisma/migrations/20260913000000_contact_search_trgm/migration.sql`
- Test: `apps/api/test/contacts-search.spec.ts`

**Interfaces:**
- Consumes: `searchFilter()` in `apps/api/src/contacts/contacts.service.ts`
- Produces: applied GIN indexes plus recorded `EXPLAIN ANALYZE` output

- [ ] **Step 1: Write the search regression test**

```ts
import { describe, expect, it } from "bun:test";
import { searchFilterShape } from "../src/contacts/contacts.service";
describe("contacts search shape", () => {
  it("filters on firstName, lastName, email and company", () => {
    const where = searchFilterShape("acme");
    expect(where.OR?.length).toBe(4);
  });
});
```

- [ ] **Step 2: Expose a test seam if needed**

If `searchFilter` is private, extract it to an exported pure helper with identical behavior and update the single call site. No behavior change.

- [ ] **Step 3: Run the test**

Run: `bun run --filter=api test contacts-search.spec.ts`
Expected: PASS

- [ ] **Step 4: Migrate staging and capture plans**

Run: `bun run --filter=db db:migrate`
Expected: migration applies, no destructive statements
Run: `EXPLAIN ANALYZE` on the contacts list query with a representative `q` before and after, paste both into `PERF_BASELINE.md`
Expected: Bitmap Index Scan on a `*_trgm` index after; revert the migration if the plan is unchanged on production-like data volume

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/migrations/20260913000000_contact_search_trgm apps/api/test/contacts-search.spec.ts PERF_BASELINE.md
git commit -m "perf: prove trigram index use for contact search"
```

---

### Task 3: Re-measure every claimed win and revert neutrals

**Files:**
- Modify: `PERF_BASELINE.md`
- Test: existing suites only

**Interfaces:**
- Consumes: baselines recorded in `PERF_BASELINE.md`
- Produces: kept/reverted verdict per idea

- [ ] **Step 1: Re-run the API suite with query logging**

Run: `PRISMA_LOG_QUERIES=true bun run --filter=api test`
Expected: 0 fail; count SELECTs per contacts-list call, compare with the recorded 6-per-request baseline

- [ ] **Step 2: Time the import dry-run**

Run: `LEGACY_CRM_SQL_PATH=./sample.sql bun run import:wamp --dry-run --limit 500`
Expected: rows/sec recorded; faster than the sequential baseline or the batching is reverted

- [ ] **Step 3: Record verdicts**

For each row in the attempts table write baseline → result plus `kept` or `reverted` with the reason. A delta inside run-to-run variance is a revert, not a keep.

- [ ] **Step 4: Commit the ledger**

```bash
git add PERF_BASELINE.md
git commit -m "chore: record optimization re-measurements"
```

---

### Task 4: Finish the deferred items — bounded facets and batched import writes

**Files:**
- Modify: `apps/app/app/(app)/contacts/contacts-table.tsx`
- Modify: `apps/api/src/companies/companies.service.ts`
- Modify: `apps/api/src/import/import-wamp.ts`
- Test: `apps/api/test/import-wamp.spec.ts`

**Interfaces:**
- Consumes: `companies.options(q)`, `chunkArray()`, `Summary`
- Produces: `companies.options` honoring caller-supplied `take`, frontend passing the live search string, chunked `createMany` import writes

- [ ] **Step 1: Write the failing options test**

```ts
import { describe, expect, it } from "bun:test";
describe("companies options bound", () => {
  it("caps rows at the requested take", async () => {
    const rows = await service.optionsBounded("", 10);
    expect(rows.length).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter=api test companies-options.spec.ts`
Expected: FAIL with method missing

- [ ] **Step 3: Implement bounded options**

Add an optional `take` (default 100, max 100) to `companies.options`, pass the table's live search string instead of `""` from `contacts-table.tsx`, keep the `facetCounts` client filter. No new full-table fetch.

- [ ] **Step 4: Batch the import writes**

Replace the per-row `create` + `markMapped` awaits in `importCompanies` and `importContacts` with preloaded mapping `Map`s plus chunked `createMany({ skipDuplicates: true })` using the existing `chunkArray` and `batchSize` option. Keep `Summary` totals identical.

- [ ] **Step 5: Verify**

Run: `bun run --filter=api test import-wamp.spec.ts`
Expected: PASS, totals unchanged, dry-run rows/sec up
Run: `bun run --filter=api test`
Expected: 0 fail

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/\(app\)/contacts/contacts-table.tsx apps/api/src/companies/companies.service.ts apps/api/src/import/import-wamp.ts apps/api/test/import-wamp.spec.ts
git commit -m "perf: bound facet fetches and batch import writes"
```

---

### Task 5: Merge follow-ups and monitor for a day

**Files:**
- Modify: none (process task)

- [ ] **Step 1: Merge the follow-up branch after review**
- [ ] **Step 2: Watch production logs for 24h** — facet-cache hit rate, research-lane throughput (capped at 4), import job durations
- [ ] **Step 3: Close the plan** — final `PERF_BASELINE.md` entry with production observations, then mark the optimization plan done

---

### Task 6: Add new providers under the research agent

**Files:**
- Create: `apps/agent/agent/lib/providers.ts`
- Modify: `apps/agent/agent/lib/capabilities.ts`
- Modify: `apps/agent/agent/lib/voice.ts`
- Modify: `.env.example`
- Modify: `apps/agent/turbo.json`
- Modify: `apps/app/turbo.json` (only if the app process reads a new variable; otherwise skip)
- Test: `apps/agent/test/providers.spec.ts`

**Interfaces:**
- Consumes: `process.env`, existing `Capability` type, `voiceApiKey()` pattern
- Produces: `providerEndpoint(name)`, `isProviderConfigured(name)`, new `capabilities()` entries, documented env vars

**Background.** The agent thinks through the Vercel AI Gateway (OIDC, no key in the agent process) with per-session model resolution via `lib/model.ts` and the `AppSetting` row. Local OpenAI-compatible servers (Ollama, LM Studio, llama.cpp) and remote gateways (Opencode, OpenRouter, Replicate) are surfaced today only as planning capabilities. Voice runs through `lib/voice.ts` (VoIPStudio for live outbound calls, Kokoro for TTS). This task adds one local endpoint plus five voice/cold-calling providers following those exact patterns.

**Provider list.** Local: KoboldCpp (`KOBOLD_BASE_URL`, `KOBOLD_MODEL`, OpenAI-compatible, default `http://localhost:5001`). Remote, all chosen for live voice-agent and outbound cold-calling work: Deepgram (`DEEPGRAM_API_KEY`, speech-to-text for live call transcription), ElevenLabs (`ELEVENLABS_API_KEY`, text-to-speech voices), Cartesia (`CARTESIA_API_KEY`, ultra-low-latency TTS for real-time replies), Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CALLER_ID`, PSTN/SIP outbound dialing), Telnyx (`TELNYX_API_KEY`, `TELNYX_CALLER_ID`, SIP trunking for outbound dialing).

- [ ] **Step 1: Write the failing provider tests**

```ts
import { describe, expect, it } from "bun:test";
import { isProviderConfigured, providerEndpoint } from "../agent/lib/providers";
describe("providers", () => {
  it("defaults KoboldCpp to loopback", () => {
    delete process.env.KOBOLD_BASE_URL;
    expect(providerEndpoint("kobold")).toBe("http://localhost:5001");
  });
  it("reports unconfigured voice vendors", () => {
    delete process.env.DEEPGRAM_API_KEY;
    expect(isProviderConfigured("deepgram")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun run --filter=agent test providers.spec.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement `lib/providers.ts`**

One entry per provider: env key(s), default endpoint where one exists (loopback for KoboldCpp), trim-or-undefined key reads, `isProviderConfigured()` returning false on missing keys without throwing. Mirror the `voiceApiKey()` / `voiceBaseUrl()` shape from `lib/voice.ts` so the two cannot drift.

- [ ] **Step 4: Register capabilities**

Append one `Capability` per provider in `lib/capabilities.ts` with a one-line `gives` describing what the agent gains (transcription, voices, dialing). Keep the existing order: research sources, picture storage, voice calling, local models, remote gateways.

- [ ] **Step 5: Document the variables**

Add each variable to `.env.example` with its purpose and where to obtain it, grouped under the existing local-provider and voice sections. Do NOT add agent-only keys to `apps/api/src/config/env.validation.ts`.

- [ ] **Step 6: Declare turbo passthrough**

Add the new keys to `passThroughEnv` in `apps/agent/turbo.json`. Add to `apps/app/turbo.json` only for variables the app process actually reads.

- [ ] **Step 7: Verify**

Run: `bun run --filter=agent test providers.spec.ts`
Expected: PASS
Run: `bun run --filter=agent test`
Expected: 0 fail
Run: `bun run --filter=agent dev` and confirm boot prints each new provider as `off` with no keys set and no throw

- [ ] **Step 8: Commit**

```bash
git add apps/agent/agent/lib/providers.ts apps/agent/agent/lib/capabilities.ts apps/agent/agent/lib/voice.ts apps/agent/test/providers.spec.ts .env.example apps/agent/turbo.json
git commit -m "feat: add KoboldCpp and voice providers to research agent"
```

## Verification

- [ ] Previous branch pushed, reviewed, merged; follow-up branch merged after review
- [ ] Trigram migration applied on staging with before/after `EXPLAIN ANALYZE` recorded, or reverted with reason
- [ ] Every attempts-table row carries a measured verdict; neutrals reverted, not kept
- [ ] `bun run check-types`, `bun run --filter=api test`, `bun run build --filter=app` green (with `$env:NODE_OPTIONS=''` in this shell)
- [ ] New provider tests pass, agent boots with all new providers `off` and no throw, `.env.example` documents each key
