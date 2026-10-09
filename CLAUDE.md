# CLAUDE.md — Shooot

@AGENTS.md

## Claude Code specifics

- **Skills:** use `shooot-brand` (`.claude/skills/shooot-brand/`) before any UI, copy or in-video graphics work. The
  superpowers workflow skills (brainstorming → writing plans → TDD → verification) match how this repo works (§8 of
  AGENTS.md).
- **Model split:** plan, design, review and verify in the main session; delegate implementation to subagents with
  `model: "sonnet"`, each in its own worktree under `.claude/worktrees/<name>` with a precise brief (spec path,
  scope, ports, verification, "do not merge"). Review their screenshots/renders and re-run the checks before merging.
- **Briefing subagents:** include the test-media and process rules from AGENTS.md §8; give each a distinct dev-server
  port; tell them not to edit AGENTS.md/CLAUDE.md (they report doc changes for the main session to fold in).
- **Outward-facing actions** (renames, domains, DNS, env vars, deletes, pushes outside the `main` flow) need the
  user's go-ahead unless they've already asked for that specific action.
