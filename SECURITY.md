# Security Policy

## Reporting a vulnerability

Please report privately through **Security → Report a vulnerability** on this repository, not in a public issue.

Include the revision, your configuration, the impact and the steps to reproduce it. If it involves real data, describe the shape of it rather than pasting it.

We'll acknowledge within a few working days and tell you what we intend to do. This is a small project and there is no bounty.

## What this is and what it assumes

This CRM is built for **one organisation of authenticated internal users**. It is not a hardened public or multi-tenant service boundary and the design says so out loud in a few places. The limits below are real and worth reading before you put customer data in it.

**Sign-in is the entire authentication model.** `ALLOWED_SIGN_IN` decides who gets in; after that, every signed-in person can read and write every CRM record — there are no per-record permissions and no tenant isolation, by design. There *is* a narrow workspace-admin role model (`owner` / `admin` / `member`) that governs only workspace administration: renaming the workspace, changing member roles, removing members, configuring SSO, and changing the agent model. It does not gate CRM data, so any signed-in member can still read and write every company, contact, deal and activity. The enforcement points live in `@crm/auth` (`canRenameWorkspace`, `canChangeRole`, `canConfigureSso`) and are mirrored by the UI; see `docs/api.md` for the full model.

An unset `ALLOWED_SIGN_IN` fails closed: nobody can sign in. A list that names a consumer domain (`gmail.com`) is an open door, which is why single addresses are supported.

**Operators can read everything.** Whoever runs the deployment has the database, the environment and the logs. Nothing here protects data from the person hosting it.

**The agent reads your mail.** Gmail and Calendar access is a condition of signing in, because reading the mailbox is what the CRM is for. The research agent reads message bodies, meeting attendees and signature blocks belonging to real people who did not sign up for this. It is deliberately unrestricted on the *read* side. The *write* side is partly code-enforced: fields such as `email` and `phone` are marked non-writable in the agent's fact schema (`apps/agent/agent/lib/facts.ts`), so the agent can only propose them, never write them directly. The *egress* side is governed by prompt rules in `apps/agent/agent/skills/data-boundaries.md` — no customer text in a third-party query, nothing from a mailbox into `/workspace`. Those rules are instructions to the model, **not a hard technical boundary**: the only code-level egress guard blocks the agent from reaching internal / loopback / link-local addresses (`packages/db/src/safe-fetch.ts`). An attacker who can place text into a mailbox the agent reads (prompt injection) could attempt to make it send customer text to a public third party, and the prompt rule is the main thing standing in the way. Treat the egress boundary as advisory and keep the agent's third-party keys minimal.

**Outbound calls send data to third parties.** Each optional key in `.env.example` turns on a vendor the agent can query and a query carries whatever it needs to ask the question — typically a name, an email domain and an employer. With no agent keys set, the agent makes no third-party queries, but two egresses still happen by default: Google's own APIs run the sync, and the API fetches the model list from Vercel's AI Gateway (`ai-gateway.vercel.sh`) whenever the settings page is opened (`apps/api/src/settings/model-catalog.service.ts`). Neither sends CRM content, but a deployer who expects zero egress with no keys set should know about the model-catalog fetch.

**The sync route is guarded by a shared secret.** `POST /internal/sync/google` is called by a cron, so it has no session to check; `CRON_SECRET` is the whole guard and the route refuses to run without it. Treat it like a password.

**Session cookies depend on one shared value.** The API and the web app both verify sessions against `BETTER_AUTH_SECRET`. Rotating it signs everyone out, which is the intended way to revoke every session at once.

## Deploying it safely

- Set `ALLOWED_SIGN_IN` to a domain you control. Never a public mail provider.
- Generate `BETTER_AUTH_SECRET` yourself (`openssl rand -base64 32`). The value in any example file is not a secret.
- Serve both processes over HTTPS. Secure cookies switch on with `NODE_ENV=production`.
- Set `CRON_SECRET` if you expose the sync route at all.
- Keep the database off the public internet.
- Start with no optional API keys and add them one at a time, so you know what is leaving.

## Supported versions

`main` is the only supported branch. There are no backports.

## Dependencies

Dependencies are updated deliberately rather than automatically. If you spot a vulnerable transitive dependency, report it the same way as anything else — a PR bumping it is welcome, but tell us what the exposure is, since a CVE in a dev-only tool and one in the request path deserve different urgency.
