# Prepare in the pub (Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Background prepare is usable on a phone or iPad left on a pub table: the screen stays on, 4K is one tap away, the pill says what is happening, and a reload says how to carry on.

**Architecture:** Small changes around the existing preparer (`src/prepare/`): the wiring takes a wake lock while a pass runs on touch devices; a pure "offer 4K" condition drives a one-tap prompt; `pillText` gains touch copy; `RelinkBanner` mentions prepared progress.

**Tech Stack:** React 19, TS strict, Zustand (`vhm-state`), Vitest + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-prepare-on-the-go-design.md` (Part 1). Background: `docs/superpowers/specs/2026-11-05-background-prepare-design.md`, AGENTS.md "Background prepare" / "Unit cache".

## Global Constraints

- Production behaviour on desktop with a mouse is unchanged except where named.
- No silent settings change: 4K is set only by the user's tap.
- Copy: sentence case, UK English, Shooot voice; lime only via the allow-list; tokens; 44 px touch targets; 14 px touch text; contrast ≥ 4.5:1; `prefers-reduced-motion`.
- Implementers: own worktree under `.claude/worktrees/`, own port (never 5174), `docs/superpowers/agents/common-rules.md`, never stage `.superpowers/`, no bare `git stash`, don't edit AGENTS.md/CLAUDE.md/DECISIONS.md, don't merge.

## Review Focus

1. Wake lock is released when prepare pauses (playback, export, user pause, nothing left) — a held lock with nothing running drains the battery.
2. The page is hidden then shown during a pass → the lock is taken again (existing `renderWakeLock` behaviour) and prepare continues.
3. The 4K offer never shows for 1080p footage, LRV-only loads, or when the setting is already 4K/1080p.
4. Accepting the offer while a highlights quality is explicitly 1080p leaves highlights at 1080p.
5. Reload with no prepared parts → banner text unchanged.

---

### Task 1: Pub-ready prepare

**Files:** Modify `src/prepare/preparer.ts` (wake-lock hooks in `PrepareDeps`, called when a pass starts/ends), `src/prepare/wire.ts` (touch-only `createRenderWakeLock`), `src/prepare/pillText.ts`, `src/components/PreparePill.tsx`, `src/components/RelinkBanner.tsx`, Export panel component that shows full match quality (find it: `FullMatchExport.tsx` / quality picker) or the pill for the 4K offer. Create `src/prepare/offer4k.ts`. Tests next to each.

**Interfaces — Produces:**
- `PrepareDeps.wakeLock?: () => { acquire(): Promise<void>; release(): Promise<void> }` — preparer acquires when a pass begins and releases when it ends, aborts, pauses or nothing is wanted. Wire passes it only when `(pointer: coarse)` matches.
- `offer4k(s: { fullMatchQuality, highlightsQuality, files }): boolean` — true when full match quality is `'original'`, at least one loaded file is a full MP4 (not only LRV proxy) whose long side ≥ `LONG_SIDE['4k'] - 16`. `accept4k()` sets `fullMatch.quality = '4k'`, and `highlightsQuality = '4k'` only when it is `'auto'`.
- UI: on touch devices with `offer4k` true, the prepare pill area (or Export full match quality row) shows a quiet button "Prepare 4K" with tip "Starts encoding the 4K full match now so Export is quicker later."; tap = `accept4k()`.
- `pillText(status, { touch })`: when `touch` and preparing → label `Preparing ${what} · ${percent}%` and a second line / tip `Keep the screen on — it stops if the phone locks.`; when ready on touch → `${What} prepared ✓`. Desktop text unchanged.
- `RelinkBanner`: when files need picking again and the preparer's shares report a prepared share > 0 for this project → adds the line `${N}% is already prepared — pick the files again to carry on.`

- [ ] **Step 1: Failing tests:** preparer acquires on pass start and releases on pause / export / done / abort (fake deps); wire passes no wake lock with a fine pointer; `offer4k` truth table (Original + 4K MP4 → true; 1080p footage, LRV only, quality 4k/1080p → false); `accept4k` with highlights `'auto'` vs `'1080p'`; `pillText` touch vs desktop; RelinkBanner with/without prepared share.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** PASS + full suite, tsc, build, eslint (baseline 11), contrast.
- [ ] **Step 5: Screenshots** 390×844 and 834×1194 touch, dark + light: pill preparing, pill ready, the 4K offer, the relink banner with prepared %. Look at each; copy to `~/Claude Files/handoff/p1-*.png`.
- [ ] **Step 6:** commit `feat(prepare): pub-ready prepare on phones and tablets`.
