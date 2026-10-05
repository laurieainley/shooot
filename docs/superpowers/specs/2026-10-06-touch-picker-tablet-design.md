# Touch Picker, Playback Feedback & Tablets — Design (Sub-project J)

**Date:** 2026-10-06
**Source:** user testing on Android after the mobile polish pass.
**Order:** after sub-project I (both touch the picker); builds on I's Kick off / Final whistle types.

## 1. Fullscreen from portrait

- Bug: in portrait, pressing fullscreen rotates to landscape and immediately exits fullscreen; entering fullscreen while already in landscape works.
- Don't force rotation: remove the automatic `screen.orientation.lock('landscape')` on enter (or only lock when already landscape). Fullscreen opens in the current orientation; rotating while fullscreen must keep fullscreen (find and fix whatever exits on resize/orientationchange — e.g. immersive/fullscreen state reset, layout switch unmounting the container, or a resize handler toggling modes).
- Verify on emulated rotation: enter fullscreen at 390×844, switch viewport to 844×390 → still fullscreen (document.fullscreenElement or immersive state retained), and back.

## 2. Event rows don't hijack playback

- Tapping/clicking an event row selects it and (touch) opens the editor. It does **not** seek or play.
- **Watch** (row action and editor button) seeks to the clip start and plays. Desktop: Enter on a selected row = Watch; single click = select only (double-click on the time cell = Watch).

## 3. Paused indicator and taps

- Whenever the video is paused (and not scrubbing), show a large centred play icon over the picture (not just the video.js big-play button before first play). Tapping anywhere on the picture still toggles play; tapping the icon plays.
- Tap disambiguation: single tap toggles play/pause; double tap on left/right third seeks ∓5 s; a **third tap within 500 ms** of a recognised double tap is ignored (no toggle). Pure helper in `src/utils/tap.ts` with unit tests (single, double, triple, double-then-later-single).

## 4. Adding events on touch

- Tapping ＋ captures the time (and file) immediately but creates **no event** until a type is chosen; nothing is preselected. Closing without choosing creates nothing.
- Type list: vertical, icon + label, grouped, **bottom-aligned** (nearest the thumb/＋), each row ≥ 48 px:
  - Goals: ⚽ Goal · Penalty goal · Own goal
  - Penalties: Penalty awarded · Penalty missed
  - Other: Save · Foul · Highlight
  - Match: Kick off · Final whistle
- Labels: the app's controls (picker, edit sheet, event log) say **Penalty goal**; outputs keep broadcast style **Goal (pen)** with a space (chapters, descriptions, captions "GOAL (PEN)"). Check the display font renders the space (user saw "Goal(pen)"). Keyboard shortcuts unchanged (P).
- After choosing a type: team step (big team buttons + Skip), person step (roster chips + search field), text step where applicable — all in the same bottom-aligned panel.
- Desktop/keyboard flow unchanged (G creates immediately, Enter = Goal).

## 5. Picker and editor placement — never cover the video

- **Landscape phone / tablet landscape:** the add flow and the edit sheet replace the right-hand events column (in-column panel with its own header and Done/Cancel), video stays fully visible and interactive.
- **Portrait phone:** the panel replaces the events list area below the video (video and match strip stay visible); content bottom-aligned; scrolls within the panel if taller than the area.
- **Desktop:** unchanged popover/inline editing.
- In fullscreen (touch): a compact bottom-aligned overlay panel limited to ~40 % of the height on the side away from the action (right side), not covering the centre.

## 6. Tablets (iPad Pro 2021 11" 834×1194 / 1194×834, 12.9" 1024×1366 / 1366×1024)

- Touch tablets get the desktop "edit bay" layout (player + strip left, events rail right) with touch sizing (44 px targets, 14+ px text), no hover-only affordances, the ＋ FAB in the rail, double-tap/pinch on video, and the in-column picker/editor from §5.
- Portrait tablet: player full width on top, strip, events below in a tall scrolling region (no page scroll).
- Verify with Playwright **WebKit** (Safari engine) and Chromium at all four tablet viewports with `hasTouch: true`: layout, picker flow, edit flow, fullscreen (WebKit fullscreen API / fallback), file input `accept` works, HEVC playability detection (`canPlayType('video/mp4; codecs="hvc1"')`) handled, render path availability (WebCodecs on Safari 17+; if VideoEncoder/AudioEncoder unavailable, graphics disabled with a clear message, plain render still works).

## Testing

- Unit: tap disambiguation; picker reducer for touch "no default / nothing created until chosen" path; label mapping.
- Component: row tap doesn't seek/play; Watch plays; paused indicator shown when paused; picker list grouped and bottom-aligned; panel placement by layout mode.
- Browser: phones 390×844 / 844×390, tablets as above (WebKit + Chromium), desktop 1440×900; screenshots j-*.png; rotation-in-fullscreen check.
