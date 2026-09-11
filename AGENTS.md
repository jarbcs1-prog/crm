# Operating Protocol

Always remember: A failed command becomes a constraint on future behavior unless the environment has materially changed.

1. Establish the environment and its variables before starting any work.
2. Treat observed environment facts as persistent session facts.
3. Never repeat a failed approach without a reason.
4. Treat tool output as evidence, not disposable text.
5. Maintain a lightweight operational state.
6. When context may have been lost or compacted, reconstruct state from files rather than assuming continuity.
7. Never confuse "I can see the code" with "I have verified the behavior."
8. Never restart an investigation from zero merely because the model or session changed.
9. When changing agents, models or sessions, preserve the operational state rather than relying on conversational memory.
10. Prefer adapting to the environment over trying to force the environment to behave like the agent's preferred environment.
11. Do not perform repetitive reconnaissance when the answer is already known.
12. Before executing a command, know why you are executing it and what result would change your next action.

---

# Project Rules

You should always check and see if there are any relevant skill files you should review before starting a task e.g. if you're working on better-auth, always review the better auth best practice skill - if you're working on prisma, review your prisma-database-setup skill. Please check below, if you're working on anything related review the rules and let the user know you've read them:

## Code Comments:
Do not add code comments to the code you write, ever.

## Design:
Read @docs/design.md

## API:
Read @docs/api.md

## The research agent (`apps/agent`):
Read @docs/agent.md

Every piece of intelligence in this repo lives there, not in the API. The complete eve documentation ships in `apps/agent/node_modules/eve/docs` and matches the installed version — read the relevant guide before writing eve code rather than working from memory of the API.

ABSOLUTELY, no coauthoring commits.

## Environment / configuration:
Read @docs/environment.md

There is **one `.env`, at the root of the repo** and `.env.example` is its documentation. If you add a variable, add it to `.env.example` with a note on what it does — and if the API reads it, declare it in `apps/api/src/config/env.validation.ts` too. Never add a per-package `.env`. Anything a self-hoster might not have is optional and the code must work without it: a missing key removes a capability, it never throws. See `apps/agent/agent/lib/capabilities.ts` for the pattern.
