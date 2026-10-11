# Find goals review actions + toasts — design

Date: 2026-10-11 · Status: approved in chat (user) · Builds on `2026-10-11-review-lanes-design.md`.

## Decisions (user)
- Moving and deciding are separate. Header: **‹ Previous** · **Next ›** only move (never decide). "Skip" is removed.
- **Discard** (key **X**) replaces "Not a goal": one press marks the suggestion as not a moment (status `rejected`,
  ring removed from the match strip) and moves to the next suggestion in the current lane. No Enter step.
- **Confirm** (key **Enter**) replaces "Save event": saves the marked moment with its type/team and moves on (as now).
  When never marked: **Confirm at estimate** (keeps the existing warning line).
- Toasts confirm key actions.

## Card
- Type step: Goal / Own goal / Save / Highlight segmented as now; "Not a goal" link → **Discard** button (quiet, not
  lime, not red) with `<kbd>X</kbd>`, available whenever the card is shown (also before marking).
- Revisiting a discarded suggestion shows "Discarded" with a "Restore" quiet button (back to pending) — the old
  "Not a goal" chip goes.
- Next on the last suggestion of the lane goes to the summary (as Skip did).

## Undo
- Discard is undoable: the toast's **Undo** and ⌘Z restore it to pending and return to that card.
  (If `decideSuggestion` is not on the store undo stack, add it there, keeping existing undo/redo behaviour for events.)

## Toasts
- One at a time (a new one replaces the current), auto-dismiss after 4 s (paused while hovered/focused), `role="status"`
  `aria-live="polite"`; optional single action button (Undo) ≥ 44 px target; neutral chalk/ink tokens (no lime, no red);
  reduced motion → no slide. Brand voice not used (plain confirmations).
- Placement: desktop/tablet landscape — reserved spot at the top-right of the video area (scorebug is top-left); must not
  cover the fullscreen button. Phone portrait — a single line directly under the video, above the panel; phone
  landscape — top-right of the video like desktop.
- Pure toast state in a tiny store (`src/toasts.ts`, like detectJobs' vanilla store) + `Toast` component; copy helpers in
  `utils/` with tests.
- Which actions (copy exact; times as the match clock, `formatClock`):
  - Confirm in review: "{Type}{ · Team} confirmed at {t}" e.g. "Goal · Whites confirmed at 12:34"
  - Discard: "Discarded {t}" + Undo
  - Tagging an event (G / picker / timeline): "{Type}{ · Team} tagged at {t}" + Undo
  - Deleting an event (rail ×, Delete key): "{Type} at {t} deleted" + Undo
  - Kick off / Half time / Final whistle set (picker, range form, timeline): "{Marker} set at {t}"
  - Nothing for playback, seeking, selection.

## Testing
- Component tests: Previous/Next don't decide; X discards + advances + strip ring gone; Enter confirms + advances;
  toast copy for each action; Undo restores (discard → pending; tag → event removed; delete → event back); one toast at
  a time; auto-dismiss (fake timers); toast not shown for playback/seek.
- Screenshots: review card + toast at 390×844, 844×390, 1280×800, dark and light.

## Addendum (user, 2026-10-11): staying in review, Top picks first, rail button
Cause found: `markEvent` / `openPicker` set `panel: null`, so tagging (G, "+ Tag event", tapping the strip) while
reviewing closes Suggested goals; the event is tagged but not linked to the suggestion.
1. **Stay in review until explicitly closed** (X / Esc on the panel) or the summary is reached:
   - Tagging while the review panel is open opens the picker on top and leaves `panel: 'review'`; when the picker
     closes, the review card is still there.
   - If that tag is a scoring/keepable type and lands inside the current suggestion's loop window, the suggestion is
     decided as kept with that event (same as Confirm), so its mini timeline and status show it; toast as for Confirm.
   - Opening another panel (Setup, Export, event edit) temporarily replaces review; closing that panel returns to
     review if it was open before (`returnTo: 'review'`). Explicit close of review clears that.
2. **Default lane when (re)opening review:** Top picks if any top pick is still to review, else All (the lane switch
   is still the user's to change; nothing moves by itself once open).
3. **Rail button after an explicit close** (while suggestions remain to review and the files match the run): at the top
   of the events list, a quiet button **"Review suggestions (5 left · 1 top pick)"** ("· N top picks" only when > 0;
   "(5 left)" without). Opens review on the default lane at the first suggestion still to review. Replaces the
   running-progress row only when no run is in progress (while running, the existing progress row + Open stays).
Tests: tagging during review keeps the panel open; in-window tag links the suggestion; other panel → close → back to
review; default lane rules; rail button copy/visibility/open.
