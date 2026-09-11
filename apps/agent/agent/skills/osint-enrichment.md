---
name: osint-enrichment
description: Verify and enrich CRM contacts with open-source intelligence. Use when the user or a task asks to research, verify, enrich, or find a contact's phone, email, or title, or when a call ends as a wrong number or a do-not-call. Produces evidence-backed bands rather than guesses.
---

# OSINT Enrichment

Turn uncertain contact data into evidence-backed fields. Every enrichment records what was found, where it came from, and how sure the agent is.

## Tools

- `flag_for_osint` — enqueues a research task for a contact (default priority 50; raise for high-value targets). The research lane works it via `identify` / `osint-enrich` tasks.
- `get_osint_queue` — lists pending research targets, highest priority first, with company names joined in.
- `mark_osint` — writes the result: corrects the contact's phone, email, and/or title when evidence supports it; stores the supporting findings; marks the target `ENRICHED` or `FAILED`.

## Evidence bands

Confidence is a band, not a percentage — set it from how strong the evidence actually is:

- `VERIFIED` — score ≥ 0.85. First-party or primary-source confirmation (the company directs the number, the record carries a verifiable source, or a live call connected to the right person).
- `PROBABLE` — score ≥ 0.55. Two or more independent secondary sources agree.
- `POSSIBLE` — score ≥ 0.30. A single plausible source; treat as a lead, not a fact.

Below that, do not write the field — record what was attempted and leave it unchanged.

## Workflow

1. `flag_for_osint` when research is needed: a call came back `WRONG_NUMBER` or `DO_NOT_CALL` (the target is then opened once, marked `SKIPPED`, and never re-verified), or a contact's phone/email/title is missing or dubious.
2. `get_osint_queue` to see what the lane is working on.
3. Research from primary and independent sources; prefer the company's own channels and the person's own profiles.
4. `mark_osint` with the corrected fields and the findings that justify them, then state the band in your reply.

## Honesty rules

- A missing phone, email, or title is never invented — there is no "best guess" field.
- `DO_NOT_CALL` is a hard stop: no calls, no re-verification, no follow-up scheduling.
- Do not merge lookalike identities; if the research cannot be tied to the actual person, keep it `POSSIBLE`, record the ambiguity, and say so.