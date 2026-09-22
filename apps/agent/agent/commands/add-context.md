<!-- Context: project-intelligence/add-context-cmd | Priority: high | Version: 1.0 | Updated: 2026-09-12 -->

# /add-context

Interactive wizard that captures project patterns and writes Project Intelligence files matching this codebase.

## Quick Reference

- **Purpose**: Generate or update `technical-domain.md` and `navigation.md`
- **Update When**: Tech stack, patterns, or standards change
- **Audience**: Agents and developers joining the project

## Usage

```bash
/add-context                 # Run full 6-question wizard
/add-context --update        # Update existing technical-domain.md
/add-context --tech-stack    # Update stack section only
/add-context --patterns      # Update code patterns only
/add-context --global        # Save to ~/.config/opencode/context/project-intelligence/
```

## Stage 1: Resolve Location

1. If `--global`: target `~/.config/opencode/context/project-intelligence/`
2. Else target `./project-intelligence/` in repo root (create if missing)

Project Intelligence standard places files in `~/.config/opencode/context/project-intelligence/`. Use `--global` to enforce that location.

## Stage 2: Check External Context

Scan `.tmp/` for files matching `*CONTEXT*.md`, `*SUMMARY*.md`, or `*OVERVIEW*.md`. If found, offer `/context harvest` first to extract reusable patterns.

## Stage 3: Detect Existing Intelligence

Check for existing `technical-domain.md` and `navigation.md` in the target folder.

- `--update`: patch in place and bump version
- default: show diff and ask replace, append, or skip

## Stage 4: Interactive Wizard

Ask exactly these six questions, one at a time:

1. **Tech Stack**: Primary language, framework, database, infrastructure and key libraries with versions.
2. **API Pattern**: Protocol, auth method, request/response shape and error format.
3. **Component Pattern**: UI framework, component file structure and state management.
4. **Naming Conventions**: File casing, function naming, variable naming and predicate patterns.
5. **Code Standards**: Function size, immutability, error handling and testing approach.
6. **Security Requirements**: Auth, validation, secrets handling, rate limiting and CORS.

For each answer, extract a 1-3 sentence summary, 3-5 key points and a 5-10 line minimal example.

## Stage 5: Generate technical-domain.md

Write `technical-domain.md` with this frontmatter:

```html
<!-- Context: project-intelligence/technical | Priority: critical | Version: {X.Y} | Updated: {YYYY-MM-DD} -->
```

Required sections:
- Quick Reference (purpose, update triggers, audience)
- Primary Stack table
- Code Patterns (API endpoint example, Component example)
- Naming Conventions table
- Code Standards list
- Security Requirements list
- 📂 Codebase References section
- Related Files section

Version rules:
- New file: `1.0`
- Content update: bump MINOR (1.1, 1.2)
- Structure change: bump MAJOR (2.0, 3.0)

Priority: `technical-domain.md` → `critical`

## Stage 6: Update navigation.md

Ensure `navigation.md` exists with frontmatter and a Quick Routes table including:

| What You Need | File | Description |
|---------------|------|-------------|
| Technical patterns | `technical-domain.md` | Stack, architecture and code standards |

If `technical-domain.md` is already present, update the description only.

## Stage 7: Validate and Confirm

Before writing, show:
- Target path
- File versions
- Line counts (must be <200)
- Missing required sections

Confirm with the user. On approval, write files and report results.

## 📂 Codebase References

- `AGENTS.md` — Project rules (no comments, env handling)
- `apps/agent/agent/commands/improve-agent.md` — Agent command format
- `apps/agent/agent/commands/multi-agent-optimize.md` — Agent command format
- `package.json` — Monorepo structure and stack hints

## Related Files

- `/c/Users/PC Principal/.config/opencode/context/core/standards/project-intelligence-management.md` — Lifecycle management
- `/c/Users/PC Principal/.config/opencode/context/core/context-system/guides/creation.md` — Context creation standards
- `/c/Users/PC Principal/.config/opencode/context/core/context-system/standards/mvi.md` — MVI format
