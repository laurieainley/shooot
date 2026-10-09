# AGENTS.md — working agreements for coding agents (Claude Code, subagents, others)

Project facts, architecture and coding rules live in `CLAUDE.md`; brand rules in `brand/shooot/BRAND.md`. This file covers how agents work in this repo.

## Worktrees

- Every parallel or delegated piece of work gets its own git worktree **inside this repo**, under `.claude/worktrees/<short-name>` (e.g. `.claude/worktrees/calm-editor`), on its own branch. Never create sibling folders next to the repo (`../shooot-x`).
  ```bash
  git worktree add .claude/worktrees/<name> -b <branch> main
  cp localhost+2*.pem .claude/worktrees/<name>/   # dev-server certs (git-ignored)
  ```
- `.claude/worktrees/` is git-ignored. Each worktree has its own `node_modules` (~230 MB), so:
  - remove a worktree as soon as its branch is merged: `git worktree remove --force .claude/worktrees/<name>` (the branch stays in git);
  - keep at most a few at once; check `git worktree list` before creating more.
- All worktrees share the repo's remote (`origin` → https://github.com/laurieainley/shooot.git). Only the main session merges into `main` and pushes.

## Test media and disk

- Generate small test media with ffmpeg in the session scratchpad (≤ 30 s, 720p, low bitrate unless the test needs more). Never search the user's home, Downloads or camera folders for videos.
- Delete generated media over 5 MB when done; the disk has filled up before.

## Processes

- Dev servers on a port assigned in the brief (never 5174, the user's own); stop every dev server and background command before finishing.
- Keep commands short with visible output; run long jobs in the background writing to a log and poll it (silent agents are stopped after ~10 minutes).

## Changes

- Red-green TDD for logic (see CLAUDE.md › Testing); never weaken a test to make it pass.
- Before reporting done: `npm run test:run`, `npx tsc -b --noEmit`, `npm run build`, `npm run lint` (no new problems).
- UI changes: screenshot at phone, tablet and desktop sizes in dark and light, and look at them.
- Commit messages end with the attribution trailers given in the brief.
