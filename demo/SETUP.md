# CRM Demo — Setup & SIP Testing Guide

This demo is a limited standalone slice of the CRM: contacts, companies, deals,
activities, call queue, and the `research-first-cold-call-v1` pitch preview.
It runs on Windows 10/11 64-bit with **nothing to install** — Node.js is bundled
inside the installer.

## 1. Install

1. Download `CRMDemo-Setup-0.1.2.exe` from the GitHub release.
2. Run it. No admin rights needed — installs to `%LOCALAPPDATA%\CRMDemo`.
3. Start Menu → **CRM Demo** → **Start CRM Demo**.
   A server window opens (minimized) and your browser opens
   `http://localhost:3000`.

To stop: close the "CRM Demo Server" window.

## 2. Test contacts (already seeded)

The demo ships with two test contact profiles under **J.A.R.B. Research Consultancy Services** with an owner
assigned — the same three things the real agent's `make_call` requires: valid
E.164 number, owner, company.

### Set up your own test numbers

1. Open the demo UI and find the seeded test contacts (Contacts tab).
2. Click a contact's phone number and type the real destination number you
   want to dial for SIP testing.
3. It must stay valid E.164: starts with `+`, 7–15 digits
   (e.g. `+` + country code + number, never a local `0...` format).
   Anything else is rejected with HTTP 400, exactly like the real
   `normalizeToE164` gate.

To add a brand-new test contact instead of editing a seeded one, insert it
into the local SQLite DB (`demo/demo.db`, table `contacts`) with an `ownerId`
and `companyId`, then restart the server — or reset everything with
`node server.mjs --reseed` to restore the seeded profiles.

## 3. Enter your Nonoh SIP settings (required)

The demo dials through **Nonoh only**. Fill the **Nonoh SIP settings** section
in the UI — same fields as the full CRM's `NONOH_SIP_*` env block:

| Field | Example |
|---|---|
| SIP server | `sip.nonoh.net` |
| Port | `5060` (TLS usually `5061`) |
| Username / Password | your Nonoh SIP account |
| Display name | shown as caller name |
| STUN server/port | only if your network needs NAT traversal |

Status shows **Nonoh ready** when server + username + password are saved.
Settings stay in local `demo.db` — the demo never sends them anywhere.
Without them, pressing **Call** is refused with HTTP 409 listing the missing
fields — same fail-fast behavior as the real `make_call` with no provider.

## 4. Simulate a test call (demo data flow)

1. Provider dropdown stays on `nonoh` (direct SIP dial).
2. Fill **Company** and **Purpose**, check the **Pitch preview** — this is the
   `research-first-cold-call-v1` script with `{firstName}`, `{company_name}`
   and `{call_purpose}` filled in from the contact.
3. Press **Call**. The demo queues the call:
   `QUEUED` + `OUTBOUND` + `calleeNumber` + `sipCallId` + `via`
   (`username@server:port`), plus a `CALL` activity entry — the same row the
   real agent writes before dialing.
4. Check the **Calls** tab.

The demo **does not place real calls and produces no audio**. It validates the
data the real dialer needs. A real test call needs the full CRM (section 6).

## 5. Reset / move data

- Reset test data: stop the server, delete `%LOCALAPPDATA%\CRMDemo\demo.db`,
  start again. It re-seeds automatically.
- Custom port: edit `Start-CRM-Demo.bat`, add `set PORT=4000` before the
  `start` line, and open `http://localhost:4000`.
- Uninstall: Start Menu → **CRM Demo** → **Uninstall**
  (your `demo.db` is left behind; delete it manually if wanted).

## 6. Real SIP test calls (full CRM, not the demo)

The demo proves the data path. To actually hear a call you need the full repo
with a configured voice provider:

1. Follow root `INSTALL.md` (Postgres + Bun + `bun run dev`).
2. Put the **Nonoh** block in the root `.env` (same fields as the demo's
   Nonoh SIP settings section):

```ini
NONOH_SIP_SERVER="sip.nonoh.net"
NONOH_SIP_PORT="5060"
NONOH_USERNAME="..."
NONOH_PASSWORD="..."
NONOH_DISPLAY_NAME="..."
```

3. Make sure the contact's phone is E.164 (`+` + country code + number, not a local `0...` format).
4. Prompt the agent with one of the prompts in `AGENT-PROMPTS.md`.
5. The agent runs `load_pitch` (`research-first-cold-call-v1`) then
   `make_call`. If it returns `queued`, a hosted provider is dialing and
   status arrives via webhook. If it returns `refused` / `invalid-number` /
   `no-provider`, fix what the reason says — do not ask the agent to
   "pretend" the call connected.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Browser shows connection refused | The server window is not running — launch Start Menu → Start CRM Demo again |
| Port 3000 already in use | Section 5, custom port |
| Phone edit rejected | Must be `+` followed by 7–15 digits |
| SmartScreen warning on the installer | Unsigned EXE — click More info → Run anyway |
