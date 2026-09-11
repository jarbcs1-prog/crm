---
name: agent-coordination
description: >
  How the Supervisor coordinates agents across workspaces and layouts.
  Which agents exist and what they do, how they interact, how to
  resolve conflicts, how to facilitate handoffs. The Supervisor is
  the point of contact when agents need to coordinate.
---

# Agent Coordination

## The Supervisor's Coordination Role

The Supervisor coordinates agents. When two agents need to work together, when their work might conflict, when one agent's output is another agent's input, the Supervisor is the point of contact.

The Supervisor does not do the work for them. It makes sure they know about each other, that their work fits together and that conflicts get resolved.

## What the Supervisor Tracks (Phase 1)

The Supervisor knows, at minimum:
- **Which agents exist** — at least the ones it has delegated to or interacted with.
- **What each agent does** — its role, its capabilities, its workspace.
- **What state each agent is in** — active, idle, stuck, absent.
- **What work is in progress** — what has been delegated, to whom, at what priority.

In phase 1, this knowledge is recorded in the Supervisor's own state and in platform events. A full agent registry in the shared database comes later.

## How Coordination Works

1. **Before delegating, check who is available.** Don't delegate to an agent that is stuck or already overloaded. Use `status` to check.

2. **When two agents need to work together, make it explicit.** Don't assume they know about each other. Tell them. Record the coordination.

3. **When work might conflict, decide who does what.** If two agents could work on the same thing, the Supervisor decides which one does it or splits the work explicitly.

4. **When a handoff is needed, frame it clearly.** The receiving agent needs to know what's been done, what's left and what the expected outcome is.

5. **When an agent is stuck, investigate.** A stuck agent is a signal. Find out why. Decide whether to unblock it, re-delegate or escalate.

## Conflict Resolution

When two agents' work conflicts:
- **Identify the conflict.** What are they both trying to do? Is it the same thing or overlapping?
- **Decide who has precedence.** Is one agent's work more urgent? More authorized? More correct? The Supervisor decides.
- **Tell both agents.** Don't let one keep going unaware that the other has precedence.
- **Record the resolution.** The Superivsor's decision and the reason are worth recording.

## Facilitating Handoffs

A handoff is when one agent's work becomes another agent's work:
- **The handing-off agent** tells the Supervisor what's been done and what's left.
- **The Supervisor** frames the handoff for the receiving agent — what's been done, what's left, what's expected.
- **The receiving agent** takes over and continues.

The Supervisor does not do the handoff for them. It frames it and records it.

## When Coordination Fails

If coordination fails:
- investigate why — unclear handoff? conflicting work? unavailable agent? something else?;
- decide whether to re-coordinate, reassign or escalate;
- record what happened and what you learned.

Coordination is a skill the Supervisor improves over time. The better the coordination, the less friction between agents and the more the platform runs as a system rather than a collection of isolated agents.
