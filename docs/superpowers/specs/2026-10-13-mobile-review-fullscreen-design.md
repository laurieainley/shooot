# Mobile review, fullscreen tagging, playback lock, touch scrubbing — design

Date: 2026-10-13 · Status: approved in chat (user: "implement it all, together, one branch") · Builds on
`2026-10-11-review-actions-toasts-design.md`.

## Why (user feedback from phone testing)
- The fullscreen tag box on a phone is congested: labels can't be seen, player names are too big, and the assist input
  is off-screen (in landscape fullscreen the picker popover is cut off at the bottom).
- Suggestions are most convenient to review in fullscreen on a phone, but the review can't be seen there.
- "Top picks" / "Other moments" overflow the right sidebar on phone landscape.
- Too much scrolling when entering goal, team, scorer and assist; it should be snappy with minimal thumb movement.
- Lane counts should be what's left: they go down as moments are confirmed or discarded.
- Single taps pause playback in fullscreen and interfere with editing: a playback lock is wanted.
- The match strip snaps to goals too easily on touch, so scrubbing accurately is hard.

## Decisions
1. **Lane counts = remaining.** "Top picks (N)" and "Other moments (M)" count only suggestions still to review
   (`effectiveStatus === 'pending'`) and update live. The card header keeps "Suggestion 2 of 5" (position in the lane).
2. **Lane switch fits narrow panels.** Smaller type (14 px) and padding in narrow panels (phone landscape sidebar,
   ≤ 360 px panel); labels may wrap to two lines; nothing is clipped or overlaps at 844×390, 390×844, 834×1194.
3. **One-thumb review card on touch (phones portrait + landscape, and the fullscreen column):**
   - Sticky action bar at the bottom of the review panel: before marking `Mark moment` + `Discard`; once settled
     `Confirm` + `Discard` (+ `Mark again` stays near the mark readout). Always visible without scrolling.
   - Type and team as compact segmented rows (44 px high, not the 64 px team buttons).
   - Less text on touch: the instruction line hides once marked; the "— press Enter to confirm" line is not shown on
     touch (no Enter key); the goals tally and lane switch sit on one line where width allows.
   - **Name chips instead of typing on touch** (`PersonStep`): the team's roster as tappable chips (alphabetical,
     wrapping, ≥ 44 px targets, body font 15 px — not the big shirt face), plus `+ New name` (only this opens a text
     field / keyboard) and `Skip` (for assist: `No assist`). Tapping the scorer moves straight to assist; the scorer is
     shown disabled in the assist chips (as now). Desktop (fine pointer) keeps the typed input with filtering.
   - When a step completes, the next step is scrolled into view if needed.
4. **Fullscreen tag box (EventPicker) on phones/tablets:** in fullscreen landscape it is a right-hand column (≈ 40% of
   the width, full height, own scroll, safe-area aware) instead of the cut-off popover; compact type buttons (14–15 px
   labels), team row, the same name chips as 3, actions pinned at the bottom. Portrait fullscreen: a bottom sheet
   (≤ 60% height). Desktop fullscreen keeps today's popover.
5. **Review in fullscreen (touch):** when the review panel is open and the player goes fullscreen, the review card shows
   in the same right-hand column (portrait: bottom sheet), compact: header with lane switch + "2 of 5" + ‹ ›, the mini
   loop timeline, the steps and the sticky action bar. A `Review (N)` button (N = left to review) joins the top-right
   fullscreen button group whenever suggestions are left; it opens / closes the column without leaving fullscreen.
   Toasts show inside fullscreen too (top-left of the column or under the top-right buttons — must not cover them).
6. **Playback lock (fullscreen, touch):** a button in the top-right fullscreen group beside the speed buttons. Its icon
   is play or pause (per playback state) with a padlock badge: closed when locked, open when not. Tapping the button
   toggles the lock (aria-pressed, label "Lock playback" / "Unlock playback"). While locked a single tap on the picture
   does not play/pause (it only shows the controls); double tap left/right still seeks ±5 s; the control bar's play
   button still works. Hint: while unlocked, 3 single taps that toggled playback within 5 s make the lock button's
   outline glow once (CSS animation; none under `prefers-reduced-motion`). Not persisted (UI state).
7. **Touch scrubbing on the match strip:** with touch / pen, event icons and flags don't capture the press; any drag
   scrubs. Only a short tap (< 6 px, < 300 ms) that lands on an icon itself (icon box, no extra margin) jumps to that
   event (as a click does today); a tap elsewhere seeks to the tapped point. Mouse unchanged.

## Out of scope
Name chips on desktop; playback lock outside fullscreen; fine-scrub (slow drag) modes; persisted lock.

## Testing
Component tests (happy-dom): remaining counts; chips flow (scorer tap → assist; New name opens input; No assist / Skip);
fine pointer keeps typing; sticky actions present; lock toggles and suppresses single-tap toggle but not double-tap
seek; triple-tap hint; touch tap on icon jumps, touch drag starting on an icon scrubs. Screenshots at 390×844,
844×390, 834×1194 (touch), 1280×800, dark and light, including fullscreen (immersive) tag box and fullscreen review.
