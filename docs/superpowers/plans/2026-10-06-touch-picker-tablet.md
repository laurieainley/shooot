# Touch picker, playback feedback & tablets (sub-project J) — Plan

Spec: `docs/superpowers/specs/2026-10-06-touch-picker-tablet-design.md`. Baseline: 687 tests, lint 19.
Red-green TDD per task; one commit per task.

## Root cause notes
- §1: rotating changes `useLayout()` (phone <-> landscape), and `AppShell` renders different trees
  (`<main class="stack">` vs fragment/`<main class="bay">`), so `Player` remounts; removing the fullscreen element
  from the DOM exits fullscreen. Also `lockLandscape()` forces rotation on enter. Fix: one stable tree (same element
  types and positions for every layout, CSS decides the arrangement) and no orientation lock.

## Tasks
1. **Stable shell tree + no orientation lock (§1).** Files: `AppShell.tsx`, `fullscreen.ts`, `App.css`.
   Tests: `fullscreen.test.ts` (requestFullscreen never calls `screen.orientation.lock`); `AppShell.test.tsx`
   (Player/stage DOM node identity survives a layout change phone -> landscape -> tablet). Browser: fullscreen at
   390x844 -> viewport 844x390 stays fullscreen and back.
2. **Tap disambiguation (§3).** `utils/tap.ts`: `resolveTap(memory, tap)` -> `{ memory, action }` where action is
   `toggle` | `toggle-later` | `seek` | `ignore`; third tap within 500 ms of a recognised double is ignored.
   Tests: single (side/centre), double, triple, double then later single, chain, other side. Wire into
   `FullscreenControls`.
3. **Paused indicator (§3).** `PlayIndicator` component (large centred play icon, `pointer-events: none`), shown when
   the player is paused and not scrubbing; video.js big-play button hidden. Tests: renders when paused, hidden when
   playing / scrubbing.
4. **Rows select, Watch plays (§2).** `EventLog`: row click selects (touch also opens the editor), never seeks; new
   Watch button per row (44 px on touch); Enter = Watch. Update the tests that asserted click-to-seek (spec change).
5. **Labels (§4).** `controlLabel()` ("Penalty goal") for picker/edit sheet/log/duplicate warning; `eventLabel()` keeps
   "Goal (pen)" for outputs. Check the graphics caption renders the space. Tests: label mapping, chapters unchanged.
6. **Deferred creation (§4).** Store: `markEvent(time, { deferred })` sets `picker: { eventId, pending }` without an
   event; `commitPending()` adds it (one undo step) on the first type choice; closing creates nothing. Reducer:
   `touchPickerState` (nothing highlighted), Enter with nothing highlighted does nothing, ArrowUp from none goes to
   the last. Fab uses deferred; G / "+ Event" / Enter flow unchanged. Tests: state + reducer + EventPicker component.
7. **Grouped vertical type list (§4).** `PICKER_GROUPS` in `eventTypes.ts` (Goals / Penalties / Other / Match) with
   icons; touch picker renders it bottom-aligned with rows >= 48 px; team step big buttons; person step chips + search.
   Tests: groups cover every option exactly once in spec order; component renders grouped list on touch.
8. **Panels replace the column (§5).** `panelSlot` store + `usePanelPlacement()` (`popover` | `column` | `compact`).
   `EventPicker` and `EventSheet` portal into the slot in the rail (landscape/tablet) or below the strip (portrait);
   EventLog/ClipSummary hidden meanwhile; fullscreen touch gets a compact right-hand overlay <= 40 % height.
   Store `fullscreen` flag. Tests: placement helper, EventSheet in slot, picker in slot.
9. **Tablets (§6).** `Layout` gains `tablet` (coarse, >= 600 px both sides, portrait); tablet landscape uses the
   desktop bay. Touch sizing, no key hints, Fab in rail, no hover-only pill tools. Tests: layout helper.
10. **Browser verification, HEVC / WebCodecs messages (§6).** Playwright Chromium + WebKit on all viewports,
    screenshots `j-*.png`; fix findings. Capability helper for `canPlayType` hvc1 and WebCodecs with tests.
11. **Docs + final checks.** CLAUDE.md shortcuts / layout notes, test, tsc, build, lint.
