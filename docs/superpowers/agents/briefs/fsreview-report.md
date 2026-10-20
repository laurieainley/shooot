# Report: touch fullscreen, panels beside the picture (feat/fs-review-layout)

## What changed
- `components/fullscreenUi.ts`: store gains `columnPanel: 'review' | 'other' | null` (which column panel is visible inside the fullscreen element) and the pure `fullscreenSplit({inFullscreen, coarse, tagging, columnPanel})`.
- `ColumnPanel.tsx`: reports itself in `columnPanel` while visible in touch fullscreen (not while the review is tucked away).
- `Player.tsx`: adds `player-container--split` when `fullscreenSplit` is true (real Fullscreen API and immersive).
- `App.css`: `--fs-panel-w` (`clamp(300px, 40vw, 440px)`) and `--fs-panel-h` (60%) on the player container. Split: landscape = `.video-js` width minus the panel, overlay (tap zones, control bar, top-right group, ＋) the same; portrait = `.video-js` height 40% (top), overlay 40dvh, panel and tag box get a definite height of 60%. Play indicator / speed indicator / render chip re-centre on the picture. Needed `.video-js.video-js` + `!important` because video.js forces `.vjs-fullscreen` to 100% x 100% with `!important`. Column panel in landscape now spans the full height (top 0): the top-right buttons are in the picture area now.
- `FullscreenControls.tsx`: ＋ (`Fab`) hidden while the review is visible in fullscreen; back when tucked away. Pause/lock fix: the lock button icon was a pause/play glyph with a padlock badge overlapping its corner; now the glyph and the padlock sit side by side (50x26 icon, 62px min-width button, 8px gap between buttons). `data-icon` / `data-lock` kept.
- Top-right buttons still hide while the tag box is open (existing test kept).

## Red to green
- New `fullscreenUi.test.ts` (4 tests) and a FullscreenControls test (＋ hidden with review shown, back when null): failed first (missing export / ＋ present), green after.
- Test title in FullscreenControls.test.tsx reworded (badge -> beside).

## Checks
- `npm run test:run` exit 0 (2558 passed), `npx tsc -b --noEmit` 0, `npm run build` 0, eslint 11 problems (baseline, none added), contrast "All pairs >= 4.5:1".

## Screenshots looked at (Android Chrome UA, touch, real Fullscreen API worked headless)
844x390, 915x412, 390x844, 412x915, 1194x834, 834x1194, dark + light: fullscreen with Find goals review (3 seeded suggestions), review tucked away (Review button; ＋ returns), tag box open. Landscape: picture left, panel right, no overlap; portrait: picture in the top 40%, panel below. Lock button: paused/playing x locked/unlocked at 844x390 and 390x844, bounding boxes checked (all buttons >= 44x44, 8px apart, none overlap).
Not every combination was opened one by one (looked at 844x390, 390x844, 412x915, 1194x834, 834x1194 samples, both themes among them).

## Proposed DECISIONS.md entry
2026-10-20 · user · Touch fullscreen: the Find goals review, other column panels and the compact tag box no longer overlay the picture. The picture shrinks to the free space (left of a right-hand column in landscape; top 40% above a 60% panel in portrait). The ＋ is hidden while the review is visible. Supersedes decisions 4-6 of `2026-10-13-mobile-review-fullscreen-design.md` (panels overlay the picture). Why: on a real Android phone the review covered half the picture and half of the ＋ . Also: the Lock playback icon now shows play/pause beside the padlock instead of overlapping it. Detail: commit on feat/fs-review-layout.

## Proposed AGENTS.md §7 "Touch fullscreen" text
Replace the first sentences with: "**Touch fullscreen** (UI state in `components/fullscreenUi.ts`, not persisted): column panels render into the fullscreen element; the tag box (`event-picker--compact`) and the review are a right-hand column (landscape) or a 60% bottom panel (portrait), and **the picture shrinks to the free space beside / above them** (`player-container--split`, `fullscreenSplit()`, `--fs-panel-w` / `--fs-panel-h`) instead of sitting behind them; the ＋ is hidden while the review is visible (it comes back when the review is tucked away with the Review button); the top-right group (speed, **Lock playback**, **Review (N)**, exit) hides while the tag box is open. The lock button shows play/pause beside a padlock (never overlapping)."

## Needs a real device
Real Android Chrome fullscreen with rotation while a panel is open (the layout follows `orientation`); iOS uses the immersive fallback (same CSS, not screenshotted); safe-area insets on a notched phone.

## Concerns
- Portrait: the top-right buttons wrap to two rows over the picture (as before); fine, but they cover part of a small picture.
- `!important` on `.video-js` sizing is required against video.js's own fullscreen rule.
