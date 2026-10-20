# Brief: unified tag & review — Phase 1: overlay player + Tag column on touch (feat/tag-view)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/tagview. Dev port 5202. Read docs/superpowers/agents/common-rules.md and follow it
(time budget for this one: up to ~60 min; stop at a clean green commit and list leftovers). Report: docs/superpowers/agents/briefs/tagview-p1-report.md
(commit it). Screenshots (throwaway): /private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/tagview-shots/.

**Spec (binding):** docs/superpowers/specs/2026-10-20-unified-tag-review-design.md — read all of it. **Reference prototype** (layout, sizes, behaviour,
copy): docs/superpowers/prototypes/review-tag-prototype.html — open it in Playwright at 844×390 to see the target. Read AGENTS.md §4/§7 (Editor
layout, Touch fullscreen, Picture gestures, Keyboard, Find goals words) before changing anything.

## Phase 1 scope (Phase 2 = Find goals on the timeline comes after you; do NOT remove the review card yet)
Applies to touch layouts only (`useLayout()` phone / landscape / tablet + coarse pointer). Desktop must be unchanged (screenshot 1280×800 to prove it).
1. **Landscape phone = the tag view** (spec decision 7), in and out of fullscreen: picture full bleed; no top bar and no rail visible; a top-right
   group: ⋯ menu (Events list, Match setup, Export, Files, Matches, New match, Shortcuts if any) — the Events list opens as an overlay sheet from the
   right (reuse the rail's event log component inside a sheet/ColumnPanel overlay); the Export render progress indicator must still be visible
   somewhere (e.g. a small dot/percent on ⋯). Scorebug stays top-left. Tablet landscape / fullscreen on any touch layout: same overlay player.
   Portrait phone: today's page, but the player band uses the new controls under the video (spec "Portrait phone").
2. **Overlay controls** (spec "The layout"): left cluster 48px buttons — bottom row ⟲5 · Play (solid light) · ⟳5; middle frame ‹ ›; top
   ◀ found / found ▶ (wire them now to jump between pending suggestions — next/previous pending found moment, seek to 6 s before and play;
   disabled when none; pure helper + tests); right cluster Tag (lime 76px). Controls fade 3 s after the last touch while playing (never while paused
   or tagging); tap on picture shows/hides; keep pictureGestures pinch/pan/zoom, playback lock and double-tap seek working; video.js's own touch
   control bar is replaced by these clusters in this view (keep it on desktop). The match strip becomes a thin overlay timeline along the bottom
   (44px touch height) in this view — reuse MatchStrip (restyle via a variant class), keep its scrub + bubble behaviour.
3. **One Tag button** replaces the ＋ (`Fab`) on touch: Tag pauses, stamps the playhead time and opens the **Tag column** (spec "Tagging"):
   from the right edge `min(36vw, 320px)` in landscape, bottom sheet ≤ 62% in portrait, choices anchored to the bottom; questions per type
   (What happened? 2-col grid incl. More… → penalty conceded/missed + markers; Team big kit buttons with per-type wording; Scorer/Goalkeeper; Assist);
   breadcrumbs (time · type · team · person) tap to go back; frame ‹ › nudge the stamped time while open; ✕ cancels; done → toast with Undo + Add note
   (existing toast/edit-sheet behaviour). Implement as the touch placement of the existing `EventPicker` flow if that's cleanest (it already has
   type→team→person steps, `PersonStep`, `panelPlacement`) — reuse logic, replace the compact presentation. Existing rule: tagging inside the open
   review's current loop confirms that suggestion — keep it working.
4. **Stable person grid** (decision 6) in `PersonStep` (shared with the review card): two columns of compact name buttons (shirt font 16px, 44px
   tall), A–Z, bottom-anchored, last row "+ New name" field (the only keyboard) + Skip / None; the scorer stays in place, disabled, on Assist; a
   name added during this tag goes at the end for this flow (no reorder). Pure helper for the order + tests.
5. Lime only on Tag (primary) and goal meaning; lime guard test stays green. ≥44px targets, ≥14px text on touch, contrast script.
Keep persisted state unchanged (no persist bump). Keep keyboard shortcuts working where they apply (G = Tag).

## Verify
TDD for helpers (next/prev pending found moment, person order, question flow per type, fade timer rules) and component behaviour (Tag pauses and
stamps; breadcrumb back; ＋ absent on touch; desktop unchanged). Screenshots touch + Android Chrome UA: 844×390, 915×412 (in and out of
fullscreen), 390×844, 412×915, 1194×834, 834×1194; desktop 1280×800; dark + light. States: playing (faded), paused, tagging each step, ⋯ menu,
Events overlay, with seeded suggestions so ◀ ▶ found are enabled. Generate a short test clip in your scratchpad folder. LOOK at each.
Propose AGENTS.md / DECISIONS.md text in the report. Do not merge/push. Stop your dev server.
