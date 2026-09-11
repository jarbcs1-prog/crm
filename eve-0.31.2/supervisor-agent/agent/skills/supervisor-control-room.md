---
name: supervisor-control-room
description: >
  The Control Room is the Supervisor's domain — the central view of all
  workspaces, layouts, agents, permissions, state and events. This skill
  defines how the Supervisor thinks about and operates the Control Room.
  It is the Supervisor's core operational knowledge.
---

# Control Room — Supervisor Core Knowledge

## What the Control Room Is

The Control Room is not a GUI. It is the Supervisor's data view of the platform:

- **Workspaces** — what workspaces exist, what each is for, what agents operate in each.
- **Agents** — what agents exist, what role each has, what state each is in (active, idle, stuck, absent).
- **Permissions** — what access is granted to whom, what is revoked, what is in effect right now.
- **State** — the Supervisor's own state (role, domain, pulse timestamp, delegation queue, investigation queue) and the platform's observable state.
- **Events** — the platform event log: delegations, permission changes, notifications, pulses, friction detections, investigations.

The Control Room lives in the shared SQLite database (`supervisor_state.db`) and in the Supervisor's own recorded state. It is observable via the `status` and `investigate` tools and readable by TheSEAS modules.

## How to Operate the Control Room

1. **Keep it current.** When something changes (a delegation, a permission, an event, a state change), record it. The Control Room is only useful if it reflects what is actually happening.

2. **Query before acting.** When you need to know the state of something, query the Control Room. Don't guess. Use `status` for a view, `investigate` for a deeper look.

3. **Flag anomalies.** When the Control Room shows something unexpected — an agent that should be active but isn't, a permission that looks wrong, a silence where there should be activity — flag it and investigate.

4. **Don't overload it.** The Control Room is a view, not a dumping ground. Record what matters. Don't record noise.

## What Lives in the Control Room (Phase 1)

- Supervisor state: role, domain, pulse timestamp, known workspaces, known agents, delegation and investigation queues.
- Platform events: delegations, permission changes, notifications, pulses, investigations.
- Shared capabilities: accumulated skills and lessons (observed, candidate, local, general levels).

## What the Control Room Is Used For

- **Delegation decisions** — knowing who is available, what they can do, what's already being handled.
- **Investigation** — having the data to look into something when it looks wrong.
- **Permission decisions** — knowing what's currently permitted and by whom.
- **Pulse** — periodic scan of the whole picture, looking for anomalies and silent problems.

## What the Control Room Is Not

- Not a GUI. A GUI may be built later to visualize the Control Room, but the Control Room itself is data.
- Not an execution environment. The Control Room records and observes; it does not execute model inference or run tools directly.
- Not a substitute for investigation. The Control Room gives you the view; investigation gives you the understanding. Use both.
