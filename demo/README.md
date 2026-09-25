# CRM Demo (standalone, Windows-friendly)

Limited working demo of the CRM. No Postgres, no Bun, no auth, no Docker.

- Runtime: Node 22.5+ only (uses built-in `node:sqlite`, zero npm dependencies)
- DB: local SQLite file `demo/demo.db` (auto-created + seeded)
- Test profiles: two seeded contacts under **Demo Co** for SIP testing — edit their phones in the UI, must stay valid E.164. See `SETUP.md` §2 for how to set up your own test numbers
- SIP test flow mirrors `apps/agent/agent/tools/make_call.ts`: E.164 validation → owner check → provider queue → `QUEUED` call row with `calleeNumber` + `sipCallId` + activity entry

## Install & run (Windows)

```bat
cd demo
node server.mjs
```

Then open http://localhost:3000

Reseed test data:

```bat
node server.mjs --reseed
```

Set port: `set PORT=4000 && node server.mjs`

## What maps to the real CRM

| Demo | Real repo |
|---|---|
| `PUT /api/contacts/:id` E.164 check | `normalizeToE164` in `make_call.ts` |
| `POST /api/calls` QUEUED + sipCallId | `Call OUTBOUND QUEUED`, `sipCallId`, `providerCallId` |
| `calls.provider` (nonoh/voipstudio/twilio/plivo/vapi) | persisted voice provider state |
| `activities` CALL entries | agent activity timeline |

Full CRM needs Postgres + Bun + Google OAuth + voice provider credentials — see root `INSTALL.md`.
