# Brief: unified tag & review — Phase 2: Find goals on the timeline (touch) (feat/tag-view-2)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/tagview2. Dev port 5203. Read docs/superpowers/agents/common-rules.md and follow it
(budget up to ~60 min; stop at a clean green commit, list leftovers). Report: docs/superpowers/agents/briefs/tagview-p2-report.md (commit it).
Screenshots (throwaway): /private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/tagview2-shots/.

**Spec (binding):** docs/superpowers/specs/2026-10-20-unified-tag-review-design.md — sections "Find goals on the timeline", "The layout", decisions 3, 8.
**Phase 1 is merged** — read docs/superpowers/agents/briefs/tagview-p1-report.md and AGENTS.md §7 "Touch view" first: `useTagViewMode()` (overlay /
band / off), `TagControls` (◀/▶ found already jump between pending suggestions), `TagColumn`, MatchStrip overlay variant, ⋯ menu, `EventsSheet`.
Prototype for look/copy: docs/superpowers/prototypes/review-tag-prototype.html.

## Scope (touch view only — `useTagViewMode() !== 'off'`; desktop keeps the review card and keyboard flow unchanged: prove with a 1280×800 shot)
1. **Find goals chip** (top right in overlay; in the band layout put it in the band): states — not run: "Find goals" + AI tag → opens the existing
   start form (`MatchRangeStep`, Kick off/Final whistle, Advanced detection with Labs) as a short sheet; running: progress (%), and a thin
   progress line on the timeline; done: "6 found · 3 top picks" (pending counts), then "All found moments checked" + the existing summary line
   ("You kept 4 of 6 …") and the known-final-score gap line where it shows today. Tapping the chip when done shows a small sheet with the
   summary + "Find goals again" / Details (Copy diagnostics) as today's summary offers.
2. **On a found moment** (playhead within the moment's window — reuse/define the window used by `reviewMark`/loop: e.g. estimate −8 s…+3 s; pure
   helper + tests): a read-only chip bottom centre "★ Top pick · 3 of 7 · 12:34" (or "Found moment · …"), and **✕ Not a goal** under Tag (right
   thumb): rejects the suggestion (`decideSuggestion(id, { kind: 'reject' })` or the existing discard path), undoable toast, then jumps to the
   next pending moment (6 s before, playing) or pauses when none is left.
3. **Tag on a found moment confirms it**: tagging (Tag column flow) while on a pending moment resolves that suggestion as tagged (reuse the
   existing confirm logic that today runs when a tag lands inside the review's loop — find it in SuggestionReview / state; make it work without
   the review card open). Jump/rings update immediately.
4. **Rings** on the overlay timeline are the found moments still to check (lime = top pick); a short tap on a ring jumps to it (6 s before,
   play) — scrubbing still works (touch rule: icons never capture a drag).
5. **Remove on touch:** the review card panel (`SuggestionReview`/`SuggestionCard` column panel), the fullscreen **Review (N)** button, the rail
   / events-sheet "Review moments" button + its ×. Starting Find goals on touch must NOT open the review panel any more. Keep all of it on desktop.
6. **Top right tidy (overlay):** Find goals chip, zoom chip (when zoomed), Lock, ⋯. Move the speed control into ⋯ (a row of speeds: 0.25 0.5 1 1.5 2
   or the existing set) and drop the separate speed ‹ 1.00x › buttons in the touch view. Keep the playback lock button.
7. Copy: feature is "Find goals", items are "found moments"/"top picks" (AGENTS §7 Words). Lime only for Tag and goal meaning.
No persist changes. TDD for helpers (moment window, next pending after discard, counts) and behaviour (Not a goal rejects + jumps + undo; tag on
moment confirms; review panel never opens on touch; desktop still has it). Screenshots (touch, Android Chrome UA) 844×390, 915×412, 390×844,
412×915, 1194×834, 834×1194 + desktop 1280×800; dark + light; states: chip not run / running / done, on a top pick with Not a goal, after discard
toast, tag on a moment, ⋯ with speeds. Seed suggestions + suggestionRun in vhm-state (see state.ts shapes) and/or run Find goals on a generated clip.
LOOK at each. Propose AGENTS.md/DECISIONS.md text. Do not merge/push. Stop your dev server.
