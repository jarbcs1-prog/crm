# Task Context: /add-context Agent Command

Session ID: 2026-09-12-add-context
Created: 2026-09-12
Status: completed

## Current Request
Implement the `/add-context` interactive wizard as an agent command in the CRM repo. The wizard should create/update `project-intelligence/technical-domain.md` and `navigation.md` following Project Intelligence + MVI + frontmatter standards. User selected Option B: agent command at `apps/agent/agent/commands/add-context.md`.

## Context Files (Standards to Follow)
- `/c/Users/PC Principal/.config/opencode/context/core/standards/code-quality.md` — universal code standards (modular, functional, pure functions, immutability, small functions)
- `/c/Users/PC Principal/.config/opencode/context/core/standards/project-intelligence.md` — project-intelligence folder purpose and structure
- `/c/Users/PC Principal/.config/opencode/context/core/standards/project-intelligence-management.md` — lifecycle management (to be read by implementer)
- `/c/Users/PC Principal/.config/opencode/context/core/context-system/standards/mvi.md` — MVI principle, <200 lines, <30s scannable
- `/c/Users/PC Principal/.config/opencode/context/core/context-system/guides/creation.md` — context file creation standards, frontmatter, navigation update
- `/c/Users/PC Principal/.config/opencode/context/core/context-system.md` — broader context system (to be read by implementer)

## Reference Files (Source Material to Look At)
- `F:/crm/apps/agent/agent/commands/improve-agent.md` — existing agent command format
- `F:/crm/apps/agent/agent/commands/multi-agent-optimize.md` — existing agent command format
- `F:/crm/AGENTS.md` — project rules (no code comments, env handling)
- `F:/crm/package.json` — monorepo structure
- `/c/Users/PC Principal/.config/opencode/context/project-intelligence/technical-domain.md` — existing template
- `/c/Users/PC Principal/.config/opencode/context/project-intelligence/navigation.md` — existing navigation template

## External Docs Fetched
None required.

## Components
1. **Command Definition** (`apps/agent/agent/commands/add-context.md`)
   - Interactive 6-question wizard specification
   - External context detection (`.tmp/` files)
   - Existing context review/update/replace flow
   - File generation rules for `technical-domain.md`
   - Navigation update rules for `navigation.md`
2. **Validation Rules**
   - HTML frontmatter required
   - MVI compliance (<200 lines)
   - Codebase references section
   - Priority assignment
   - Version tracking
3. **Integration**
   - Follow existing agent command conventions
   - Reference context system standards
   - Update any command registry if one exists

## Constraints
- Do not add code comments (per AGENTS.md)
- Files must be <200 lines and follow MVI formula
- All files must start with HTML frontmatter
- Must include "📂 Codebase References" section
- Must update `navigation.md`
- Must assign priority (critical/high/medium/low)
- Must track versions (new file = 1.0, content update = minor, structure change = major)
- Target location: `apps/agent/agent/commands/add-context.md`

## Exit Criteria
- [ ] `apps/agent/agent/commands/add-context.md` created with complete wizard workflow
- [ ] Command follows existing agent command format and project rules
- [ ] MVI-compliant (<200 lines, scannable, frontmatter, codebase refs)
- [ ] Any command registry/navigation updated if required
- [ ] No code comments added
