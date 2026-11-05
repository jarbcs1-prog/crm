# Plan: Port datasets maturity-gap ideas into F:\crm

Source: comparative audit `F:\datasets` vs `F:\crm` (report segment "Maturity gap").
Goal: adopt proven patterns without breaking CRM invariants.

Invariants (must not violate):
- Intelligence lives only in `apps/agent/agent/` (`docs/agent.md`, `docs/api.md`). API only writes `AgentTask` rows via `apps/api/src/agent/agent-trigger.service.ts`, never calls vendors.
- One root `.env`; `.env.example` is docs; API-read vars declared in `apps/api/src/config/env.validation.ts`; agent-optional vars gated in `apps/agent/agent/lib/capabilities.ts` (missing key removes capability, never throws).
- UI only in `packages/ui` (`docs/design.md`); tRPC routers thin (`*.router.ts` zod + service call, `*.service.ts` Prisma).
- Agent lanes: `DIRECT_KINDS` in `packages/db/src/agent-tasks.ts`, priorities brand 900 > portrait 800 > workspace 500 > requested 300 > meeting 200 > identify 100 > sweep 50 > companyProfile 40 > recheck 0; `claimDue` with `FOR UPDATE SKIP LOCKED`; `schedules/dispatch.ts` is the only schedule; `POST /internal/crm/dispatch` + `poke()` fire-and-forget drains both lanes via `drainAll` + `lib/pool.ts:collapsing()`.
- Evidence model: tools report observations, `lib/evidence.ts` prices, `lib/facts.ts` writes at VERIFIED only (`docs/agent.md#evidence-not-confidence`).
- Sandbox `agent/sandbox/sandbox.ts` deny-all egress, never `DATABASE_URL`.
- Voice today: Nonoh SIP (`agent/lib/nonoh-sip.ts`), Kokoro TTS + Faster-Whisper XXL (`agent/lib/voice.ts`), Deepgram fallback; pitches in `agent/pitches/` via `load_pitch`; `speak_on_call` / `listen_on_call` enforce consent/refusal policy.
- eve API: `apps/agent/node_modules/eve/docs/README.md` is source of truth; check `.agents/skills/eve` before coding.

## Stage 0 — Baseline + gates (0.5 day)

0.1 Pin current behavior: `bun run --filter=agent check-types`, `bun run --filter=agent test`, `bun run --filter=api trpc:generate` diff empty (committed `apps/api/src/generated/server.ts` must not regen on build).
0.2 Add call-outcome seed data audit: which `record_call_outcome` fields exist today vs 5-metric set below; which `AgentTask` kinds exist for voice (`schedule_calls`, `make_call`, `call_status` tools).
0.3 Gate: no new vendor client in `apps/api`; no new `.env` file; no new top-level schedule.
Exit: baseline test log + field-gap table in `docs/voice-maturity-port-plan.md` appendix.

## Stage 1 — 5-metric call extraction + call lifecycle hardening (1–1.5 days)

Port: n8n `Outbound Lead Qualifier` extraction + `Cold-Calling-Agent-main` batch/pause-resume.
1.1 Normalize dialing input: E.164 sanitize helper in `apps/agent/agent/lib/` (reuse `normalizeDomain` pattern from `apps/api/src/companies/domain.ts` — one helper, not a second rule). Invalid/voicemail routing: terminal branch in pitch policy (`agent/pitches/`), reported via `record_call_outcome` + `missing`, never invented.
1.2 Extend `record_call_outcome` payload with 5 metrics (interest, motivation, urgency, experience, budget) as observed fields, priced by `lib/evidence.ts`; storage columns via Prisma migration in `packages/db`; API side only files them (`contacts.service.ts`-style `FACT_COLUMNS` update if writable, else proposal-only per sensitive-field rule).
1.3 Poll-until-ended: `call_status` lease loop on `dueAt`, not a cron expression; pause/resume = task lease release/reclaim (`lib/tasks.ts`), visible in `list_outstanding_work`.
1.4 Verification: unit tests for E.164 + voicemail/invalid branches; integration spec that a finished call writes outcome + 5 metrics and settles `finishedAt` (regression guard for `crm:task:` namespacing bug in `docs/agent.md`).
Env: none new (uses existing Nonoh/Kokoro/Whisper/Deepgram fallback).

## Stage 2 — Pluggable voice providers behind capability gates (1.5–2 days)

Port: Vapi recipe (`Cold-Calling-Agent-main`) + Plivo bulk path (`NeuroCaller-Agent-main`), kept optional.
2.1 Abstract dialing behind `SipClient` interface already in `agent/lib/nonoh-sip.ts` / `agent/lib/telephony/`: add `VapiDialer`, `PlivoDialer`, `TwilioDialer` implementations that conform to the same `make_call` / `answer_call` / `end_call` / `transfer_call` tool surface. No tool signature change for the model.
2.2 Capability gates in `lib/capabilities.ts`: `VAPI_API_KEY`, `PLIVO_AUTH_ID/PLIVO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_CALLER_ID` (last three already stubbed in `.env.example:203-207`). Missing key = provider absent from plan instructions + shared "not configured" result before budget charge. Document each in `.env.example`; declare only API-read ones (none — agent-only) in `env.validation.ts` accordingly (i.e. do not add agent-only keys there).
2.3 Assistant-builder parity: `load_pitch` gains a Vapi-compatible render (segments + `conversation[]`/`refusal_branches`/`consent_rules` mapping) so one pitch file drives Nonoh and Vapi; WhatsApp/deals-pipeline writes go through existing `create_contact` / deal services via `AgentTask`, not direct API vendor calls.
2.4 Verification: `GET /eve/v1/info` lists same tool surface with/without keys; per-provider fake-transport tests; `test/channel-auth.spec.ts`-style auth pin for any new webhook route (`VOIPSTUDIO`-pattern: inert without keys).
Env diff: document Vapi/Plivo keys in `.env.example` (agent-only, no API validation change).

## Stage 3 — RAG for pitches/objections + bulk queue with analytics (2 days)

Port: `NeuroCaller` Qdrant/LangChain RAG + Redis queue + transcription/analytics.
3.1 RAG as read-only retrieval: new `agent/lib/pitch-rag.ts` (local-first; Qdrant optional behind `QDRANT_URL/QDRANT_API_KEY` capability). Indexed corpus = `agent/pitches/` + objection handlers from `voice-ai-cold-calling-skill-main` tactics (5-question opener, pain math, 8 handlers) checked into repo as data, not code. Retrieval runs in app runtime (like `web_fetch`), never in sandbox; chunks carry source ids so `listen_on_call` can cite which handler fired.
3.2 Bulk queue: reuse `AgentTask` + `claimDue` priority lane rather than a new Redis queue unless load proves need; if Redis adopted, use existing `REDIS_URL` + `cache-manager` read-through pattern from `docs/api.md`, explicit invalidate, no global interceptor. Batch cap + per-tick concurrency mirror (visible 60/6, research 12) with new voice-batch kind priority slotted below `requested` (300) so logos/faces never queue behind calls.
3.3 Analytics: call transcription already via Faster-Whisper/Deepgram; add `call_analytics` read (duration, barge-in count, terminal branch, 5 metrics) surfaced through existing `read_*_history` tools (hands back neighbour ids, no dead ends) + `AgentEvent` audit rows. No confidence scores accepted from model (`docs/agent.md`).
3.4 Verification: RAG disabled without key still answers from checked-in pitches; 30 `identify` rows do not delay one `brand` row (extend `test/lanes.integration.spec.ts` with voice-batch kind); analytics read returns ids for contact/company/deal.
Env diff: `QDRANT_URL`, `QDRANT_API_KEY` optional, agent-only.

## Stage 4 — Simulation + Writer-Critique self-improvement (2–2.5 days)

Port: `self-improving-outbound-caller-agent-main` Library Hub + simulation + multi-dim scoring + prompt optimizer. Highest risk — keep human-gated.
4.1 Simulation harness (offline, sandbox): persona library (`Library Hub` equivalent) as versioned fixtures under `apps/agent/agent/skills/` or `data/`; simulated turns run with deny-all egress, local model only, never against real SIP. Multi-dim scorer writes proposed pitch diffs, never applies them (proposal path like `lib/facts.ts` below-VERIFIED).
4.2 Writer-Critique loop: `eval` script (Gemini 2.5 Flash or configured default via `defineDynamic`, never hardcoded) scores simulated calls on the 5 metrics + consent/refusal compliance (`speak_on_call` refusal without recorded consent, clarify-once/pin-down/terminate rules from `docs/agent.md#voice-calling`); optimizer emits pitch patch candidates with audit trail (`AgentEvent` + file diff), applied only by explicit rep approval (`lib/approval.ts` path).
4.3 Audit: every auto-generated prompt version tagged with eval scores + corpus hash; rollback = checkout prior pitch file.
4.4 Verification: simulated suite green on `bun run --filter=agent test`; negative tests (document-request without consent refused; brush-off clarified once; deferral pinned; repeat-later-without-time terminated with closing line).
Env diff: none required (reuses model chain); optional `EVAL_MODEL_OVERRIDE` only if needed, else `AppSetting` row.

## Stage 5 — Training-data flywheel: Judge/Arena + layout ingest + synthetic dialogues (2 days)

Port: EasyDataset Judge-model + Arena, OpenIngest layout parsing, sdialog simulation.
5.1 Judge + Arena: reuse `packages/session-datasets` pipeline (`tasks/plan.md` T3.1–T3.3): export call transcripts + 5-metric labels to EasyDataset bundle (`export:easydataset`), Judge-model auto-eval + blind Arena for pitch variants. Outputs feed `training/*/run_train.py` (QLoRA Qwen2.5-3B default); configs stay model-agnostic via `data_path`/`output_dir`/`model_name` params.
5.2 Layout ingest: OpenIngest-pattern `documents/pages/cells.jsonl` + table/figure capture for sales collateral → pitch-rag corpus; OCR backends optional capabilities (Azure-DI/Textract/Gemini), local-first default. doc2dataset-style exports (HF/LLaMA-Factory/Axolotl/OpenAI) reuse adapter pattern (`toAgenticMini`/`toToolCalling`/`toSafetyRouting`).
5.3 Synthetic dialogues: sdialog-pattern generator (persona multi-agent, orchestrators, LLM-judge metrics) to expand beyond 7 real sessions (`F:\datasets\TODO_NEXT.md:44` overfit warning); tag `source: synthetic-*`, dedup via content-hash, PII scrub `<REDACTED>` (existing T2.6).
5.4 Verification: `validate:*` + `stats` pass; `parquet-tools schema` diff vs `opencode-agentic-mini` template; `python -m py_compile training/**/run_train.py`; EasyDataset import smoke test.
Env diff: ingestion OCR keys optional, agent-only.

## Stage 6 — Ship hardening (0.5–1 day)

6.1 `docs/session-datasets.md` + `docs/VOIP_SETUP.md` updates; `.env.example` entries for every new key with "missing removes capability" note; API validation lists only API-read vars.
6.2 Fresh-checkout reproduce: `bun run check-types`, `bun run lint`, agent integration specs against real Postgres, `curl` bridge checks from `docs/agent.md#checking-it-without-a-browser` (401/401/502 matrix).
6.3 Rollout order: Stage 1 → 2 → 3 → 5 (value, low risk) before Stage 4 (autonomy risk). Feature-flag new providers off by absent keys, not code flags.

## Ordering / dependencies

Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 6.
Parallelizable: 2 ∥ 3.1 (provider abstraction vs RAG corpus curation); 5.2 ∥ 5.3 after 5.1 bundle shape fixed.
Never parallel: 4 after 1 (needs 5-metric scorer + refusal policy tests green).

## Success criteria

1. One pitch file drives Nonoh + at least one of Vapi/Plivo/Twilio with no tool-surface change.
2. Every call ends in `record_call_outcome` with 5 metrics or explicit voicemail/invalid terminal + closing line spoken.
3. RAG off = still calls from checked-in pitches; RAG on = handler citations in transcript.
4. Bulk batch never delays `brand`/`portrait` lane (test-pinned).
5. No simulator session touches SIP/network; no auto-applied prompt change; every change has eval scores + rollback.
6. EasyDataset bundle imports; validators pass; training configs `py_compile` clean.
7. No invariant broken: `bun run check-types` + `lint` + agent tests green; `.env.example` complete; API validation unchanged for agent-only keys.

## Appendix A — Stage 0 baseline (2026-09-24)

0.1 Gates:
- `bun run --filter=agent check-types`: exit 0.
- `bun run --filter=agent test`: 272 pass, 1 skip (STUN live), 0 fail.
- `bun run --filter=api trpc:generate`: binary blocked, falls back to committed `apps/api/src/generated/server.ts`; `git diff --exit-code` on that file: clean (no regen drift).

0.2 Field-gap table (`record_call_outcome.ts` + `Call` model vs 5-metric set):

| Target metric (n8n) | CRM today | Gap |
|---|---|---|
| interest | `clidInterestScore Float?` + `interest` 0-1 input | present, CLID-named; needs alias/mapping to generic interest |
| motivation | none | missing field + input + column |
| urgency | none | missing field + input + column |
| experience | none | missing field + input + column |
| budget | `AgentTask.budget Int` (task effort, not lead budget) | missing as call outcome; name collision, needs distinct column |
| control/liquidity/decisionMaker | `clidControlScore/Liquidity/DecisionMaker Float?` | present, CRM-specific, keep |
| summary | `Call.summary String?` | present |
| terminal routing | `CallOutcome` VOICEMAIL/WRONG_NUMBER/DO_NOT_CALL + OSINT SKIPPED pause | present; invalid-number branch implicit via `make_call` no-number failure |

Voice `AgentTask` kinds inventory: single `call` kind at priority 150 (`packages/db/src/agent-tasks.ts`), below `requested` 300 and above `identify` 100; no dedicated bulk/voice-batch kind. Tools: `schedule_calls` (batch schedule, kind `call`), `make_call` (Nonoh only), `call_status` (lease/poll read), `record_call_outcome` (terminal write), `answer_call/end_call/transfer_call`, `speak_on_call/listen_on_call/load_pitch`.

0.3 Confirm: no new vendor client in `apps/api`, no new `.env` file, no new schedule. Stage 0 adds docs only.

## Appendix B — Stage 2 providers (2026-09-24)

New `apps/agent/agent/lib/dialer.ts`: `VoiceDialer` (`isConfigured`/`placeCall`/`hangup`) + `NonohDialer` wrapping `CallSession.dial` + `TwilioDialer` (form-encoded `Calls.json`, Basic auth, needs `TWILIO_TWIML_URL` or `TWILIO_TWIML`) + `PlivoDialer` (JSON `Call/`, needs `PLIVO_ANSWER_URL` + caller id) + `VapiDialer` (`call/phone`, Bearer, needs `VAPI_PHONE_NUMBER_ID` + assistant from `load_pitch` or `VAPI_ASSISTANT_ID`). `selectDialer()` Nonoh → Twilio → Plivo → Vapi; missing keys = absent, `placeCall` never fires without full instructions. `make_call` input schema unchanged (`contactId`/`phone`/`requiresOsintCheck`); cloud branch writes `QUEUED` + `RING` event + `meta: {provider}` and returns `queued: true` (live audio bridging deferred to provider-webhook stage). `end_call` routes via `hangupCall(meta, sipCallId)`. `load_pitch` adds additive `vapi` block to both schemas. Gates: root `check-types` 11/11; agent `bun test` 297 pass / 1 skip (STUN live) / 0 fail across 31 files. No API changes; no new schedule; no webhook routes added.

## Appendix C — Stage 3 RAG + bulk + analytics (2026-09-24)

3.1 Retrieval: new `apps/agent/agent/lib/pitch-rag.ts` — local-first token-overlap search over checked-in data (`loadPitchCorpus` never throws, `[]` when unreadable). Corpus = `apps/agent/data/pitches/*.json` (segments + conversation text + refusal-branch triggers/text) + new `apps/agent/data/objection-handlers.json` (12 handlers distilled from `F:\datasets/voice-ai-cold-calling-skill` Technique 01/02: survey opener, hesitation, answering-service, forward-to-cell, not-owner, uncomfortable-sharing, too-small, human-quotes, pain math, third-party soft pitch, demo deferral, journey-mirror close). Chunks carry `pitch`/`segment`/`title` ids; `listen_on_call` attaches top-2 `handlers` citations to every transcribed turn (additive field, branch matching unchanged). `isQdrantConfigured()` requires both `QDRANT_URL` + `QDRANT_API_KEY`; remote querying deferred (no embedding provider configured — adding one is a new-vendor decision, not taken here). Capability + `.env.example` entries are agent-only, no API validation change. RAG-off fallback = empty corpus yields no citations; pitches still speak via `load_pitch`.

3.2 Bulk: `voice-batch` added to `TASK_KINDS` (`packages/db/src/agent-tasks.ts`), `PRIORITY.voiceBatch = 250` (below `requested` 300, above `meeting` 200). `dispatch.work()` gains a `voice-batch` brief (same script + consent/refusal policy note; batch pace never overrides policy). `schedule_calls` gains optional `bulk` flag (kind `voice-batch`, priority 250) and `SCHEDULE_BATCH_CAP = 60` with `capped`/`skipped` reporting. No new queue: research lane (`RESEARCH_BATCH` 12) drains voice-batch via existing `claimDue` ordering; no Redis (unproven need); no new schedule.

3.3 Analytics: `readCrmHistory` gains `calls` (recent 10: id/direction/status/outcome/duration/scores/companyId — neighbour ids for contact/company/deal follow-up) + `callAnalytics` (totalCalls, connected via answeredAt, per-outcome counts via groupBy, avg duration + avg 8 scores). Surfaced through existing `read_crm_history`; description updated. Two documented deviations: (a) no barge-in count — no audio-pipeline overlap detector exists and transcript text cannot evidence it, so nothing is reported rather than a faked zero; (b) no `AgentEvent` rows — tool ctx (`{crm, call}`) carries no session identity and `AgentEvent` requires `sessionId` + explicit `id`, so the audit trail stays in `CallEvent` rows (`RING`/`ANSWER`/`HANGUP` written by `make_call`/`record_call_outcome`). No schema migration; no API changes.

3.4 Tests: `test/pitch-rag.spec.ts` (5: corpus loads 12 handlers, answering-service match, empty-query [], missing-dir fallback, Qdrant gate); `test/schedule-calls.spec.ts` (cap 60 + bulk kind, no DB writes); `test/call-analytics.integration.spec.ts` (calls + aggregates against real Postgres); lanes spec += bulk starvation test (30 voice-batch never delay brand, never enter visible lane) + ordering/priority assertions; `capabilities.spec.ts` KEYS += QDRANT pair. Gates: root `check-types` 11/11; agent `bun test` 306 pass / 1 skip (STUN live) / 0 fail across 34 files.

## Appendix D — Stage 4 simulation + Writer-Critique (2026-09-24)

Deliberate deviation from the source pattern: `self-improving-outbound-caller-agent` simulates with an LLM debtor + Gemini judge and auto-applies tuned prompts. Ours is deterministic and human-gated instead — a rule-based offline simulator (no LLM variance, no network, no cost) plus a rule-based Writer-Critique that can only draft proposals. Rationale: simulated LLM calls cannot evidence real-call quality, and auto-applying prompt changes violates the plan's success criterion 5.

4.1 Fixtures: new `apps/agent/data/call-personas.json` (Library-Hub equivalent, 8 personas: cooperative, brush-off, explicit-refusal, do-not-contact, deferral-no-time, verification-concern, wrong-number, document-volunteer). New `apps/agent/agent/lib/call-sim.ts`: pure `runSimulation(segments, branches, persona)` — walks pitch segments, consumes persona script lines per listen turn, matches replies against refusal triggers (short triggers ≤3 chars use word boundaries so "not interested" never trips the "No" trigger), enforces clarify-once budget, pin-down-then-terminate on repeat-later-without-time, consent via explicit-affirmative regex, document-request detection that ignores negated sentences ("I will not ask you to provide documents" is clean). `scoreSimulation` returns taskCompletion/efficiency + 4 compliance checks (no-document-without-consent, clarify-once, closing-line-spoken, do-not-contact-honored) + 5-metric simulated estimates keyed off terminal state (labeled estimates for regression comparison, never written to `Call` rows).

4.2 Writer-Critique: new `apps/agent/agent/lib/pitch-tune.ts` — `loadSimPitch`/`loadPersonas` (never throw, reason objects), `evaluatePitch`, `buildContextPackage` (mirrors the source `build_context_package` shape: current pitch, target, per-failure scores + transcript excerpt + improvement guidelines), rule-based Writer `draftPatchesFor` (failure id → patch op: add-consent-gate, tighten-segment, add-closing-line, add-clarify-beat), Critique `critiquePatches` (drops document-requesting, pressure-past-refusal, and empty patches; max 3 cycles), `writePitchProposal` to `data/pitch-proposals/`. New `propose_pitch_patch` tool (pitchId + optional personaId/targetScore, default 0.8) wired with `approval: sensitiveWrite(...)` — automated sessions are denied outright, human reps get a user-approval prompt. No code path writes `data/pitches/`.

4.3 Audit: each proposal file carries `status: "DRAFT"`, per-persona eval scores, sha256 `corpusHash` over pitch text + personas raw, critique history, and an `applyNote` (human promotes by hand-editing the pitch file; rollback = checkout prior pitch file from git).

4.4 Tests: `test/call-sim.spec.ts` (9) + `test/pitch-tune.spec.ts` (9) covering consent, refusal-with-closing-last, clarify-once-then-terminate, pin-down-then-terminate, document-without-consent failure, DNC honored, wrong-number, determinism, context package, patch mapping, critique drops, cycle-to-DRAFT, hash stability, proposal write isolation. Live check against the real v2.1 pitch: cooperative tc=1/ef=1 pass; brush-off and deferral-no-time fail on taskCompletion (policy-correct early termination scores low — expected, proposals stay DRAFT); refusal/DNC/wrong-number/verification pass compliance. Gates: root `check-types` 11/11; agent `bun test` 324 pass / 1 skip (STUN live) / 0 fail across 36 files. No env changes; no API changes; no new schedule.

## Appendix E — Stage 5 training flywheel (2026-09-24)
Deliberate deviation, same rationale as Stage 4: the sources use LLM judges (EasyDataset Judge-model, sdialog LLM-judge metrics). Ours is deterministic and human-gated instead — a rules Judge over record completeness plus a blind Arena over pitch variants, both offline with no model variance and no auto-apply path. No new vendor, no new env keys, no API changes, no new schedule.

5.1 Call export + Judge + Arena: new `packages/session-datasets/src/export/callDataset.ts` — takes a calls JSON array (shape mirrors the `Call` model: id/transcript/summary/outcome/8 scores/direction/durationSeconds/pitchId; the agent side already surfaces these via `read_crm_history` calls, Stage 3, so the package stays decoupled from `@crm/db`) and emits canonical `Session` rows (`source: call-transcript`, tags `source:call-transcript` + `outcome:*` + `pitch:*`; empty transcript+summary skipped). `SessionSource` gains `call-transcript` + `synthetic-call`. Judge = 4 completeness checks (transcript/outcome/scores/summary presence) scored 0-1; Arena = per-`pitchId` mean judge score with variants blinded by sha256 order (`Variant A/B/...`, reveal map, winner). `writeCallDataset` emits `call-canonical.jsonl` + `judge.json` + `arena.json/md` and reuses `writeBundles` for the EasyDataset import bundle (`easydataset-import.json` + conversations + `manifest.json`). Fixture run (4 calls in, 1 empty skipped): judge 3x1.0, arena 2 variants, manifest datasets 3, import smoke (non-empty question/answer) OK.

5.2 Layout ingest: new `apps/agent/agent/lib/layout-ingest.ts` — OpenIngest-pattern `documents/pages/cells.jsonl` rows from sales-collateral markdown (pages split on `---` rules; cells = text blocks, `|...|` tables with header + data-row count, `![alt](src)` figures). `toPitchChunks` maps rows to `PitchChunk` (`source: pitch`, `pitch: collateral-<stem>`); `loadPitchCorpus` gains optional `collateralDir` (default `data/collateral/`, missing dir = `[]`, so RAG-off behavior is unchanged; pass `false` to skip). OCR backends deferred — local-first markdown default per plan; adding Azure-DI/Textract/Gemini is a new-vendor decision, not taken here.

5.3 Synthetic dialogues: new `packages/session-datasets/src/export/syntheticCalls.ts` — sdialog-pattern deterministic generator (persona multi-agent shape: 8 personas from `apps/agent/data/call-personas.json` x pitch segments from `apps/agent/data/pitches/`, assistant-segment/user-script alternation ending in a closing line). Tags `source:synthetic-<personaId>` + `pitch:<stem>`; reuses existing `dedup()` (content-hash) and `scrubSession()` (`<REDACTED>` replacement). Live run: 32 sessions (8 personas x 4 segment-bearing pitches; 1 pitch file carries no segments), avg 12 turns, 0 duplicates, 0 redacted.

5.4 Verification: new `src/validate/callDataset.ts` (source allow-list, `source:*` tags, >=2 turns, judge coverage + 0-1 range, arena winner consistency) + `export:call-dataset` / `build:synthetic-calls` / `validate:call-dataset` scripts. Chain run in temp: canonical -> agentic-mini (3 records, 0 errors) -> Parquet (3 rows, `messages`/`metadata` schema) -> safety (3 records, 0 errors); tool-calling correctly yields 0 records (call transcripts carry no tool calls — expected, validator exits 0 on empty); `validate:call-dataset` 0 errors; `py_compile` clean on all 4 `training/**/run_train.py`. New unit tests: `callDataset.test.ts` + `syntheticCalls.test.ts` (14 pass) and agent `test/layout-ingest.spec.ts` (4 pass). Two fixes found by the run: (a) pre-existing Windows bug in `agenticMini.ts` `writeParquet` — the generated `_to_parquet.py` interpolated backslash paths into a non-raw Python string (`unicodeescape` SyntaxError); fixed by emitting forward-slash paths. (b) `packages/session-datasets/tsconfig.json` now excludes `src/**/*.test.ts` (bun:test types unknown to tsc; mirrors the repo convention where agent `test/` is outside `tsc` include). Gates: root `check-types` 11/11; agent `bun test` 328 pass / 1 skip (STUN live) / 0 fail across 37 files; session-datasets `bun test` 14 pass / 0 fail.

## Appendix F — Stage 6 ship hardening (2026-09-24)

6.1 Docs: `docs/session-datasets.md` CLI Reference gains `export:call-dataset` / `build:synthetic-calls` / `validate:call-dataset` rows and Per-Source Notes gains finished-calls + synthetic-calls rows. `docs/VOIP_SETUP.md` PSTN table gains Plivo and Vapi rows, Twilio TwiML requirement, dialer order (Nonoh → VoIP Studio → Twilio → Plivo → Vapi, first configured wins), E.164 normalization note, and a Qdrant section. `.env.example` already documented every new key with missing-removes-capability notes (verified: Twilio+TwiML, Plivo, Vapi, Qdrant blocks). API validation audit: no new agent-only key added to `env.validation.ts` (grep for VAPI/PLIVO/QDRANT/TWIML/NONOH finds only the pre-existing `NONOH_*` entries, which the API predates the port with — untouched); new keys are agent-only by construction.

6.2 Gates: root `bun run check-types` 11/11; agent `tsc --noEmit` clean; agent `bun test` 328 pass / 1 skip (STUN live) / 0 fail across 37 files against real Postgres (integration specs emit live prisma queries). Lint: `bun run lint` is red at baseline repo-wide (CRLF `␍` format diffs + width reflows across app/api/agent files the port never touched — pre-existing Windows-checkout condition, not port-caused). Port files are held to a stricter bar instead: `biome lint` over all 17 port-touched agent files is clean after fixing 5 genuine port-introduced findings (unused `isTerminalAction`, dialer import order, useless `continue` in pitch-tune catch, `lines[0]!` non-null assertion, unused `evaluatePitch` `targetScore` now `_targetScore`); remaining `format` width diffs match the repo-wide baseline style and were deliberately left alone to stay consistent with surrounding code. Bridge curl matrix (401/401/502) not re-run: no bridge code was touched in any stage, and it needs live dev servers; recorded here as a manual pre-ship step.

6.3 Rollout: Stages 1 → 2 → 3 → 5 (value, low risk) ship before Stage 4 (autonomy risk — simulator + proposal writer stay behind `sensitiveWrite` human approval regardless). Providers stay off by absent keys, not code flags: `selectDialer()` returns null unconfigured, Qdrant gates on URL+key pair, RAG-off still calls from checked-in pitches.

## Appendix G — Selectable voice providers (2026-09-24)

The follow-up requirement keeps both existing Nonoh.net SIP settings and VoIP Studio settings, and makes all five providers explicit choices. `VoiceProvider` is now shared from `@crm/db/settings`; `AppSetting.voiceProvider` stores a nullable human default. `make_call` accepts a per-call provider override and hosted assistant, otherwise uses the stored default, and otherwise preserves automatic first-configured selection. A selected but unconfigured provider fails clearly instead of silently switching. Settings → General lists every provider with visible configured state, invalid-state and non-admin read-only feedback, plus an Automatic option. Provider metadata is persisted on calls; provider status polling normalizes hosted states, Vapi termination uses the stop control, and failed/unidentifiable hangups remain retryable. Missing/invalid provider metadata, unknown saved settings, malformed phone numbers, and stale Nonoh-only guidance all fail closed or are explicitly documented.
