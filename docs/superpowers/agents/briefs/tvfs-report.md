# tvfs report: touch view landscape fill, no overlap, simpler picture gestures, rotation framing

Status: done, green, not merged.

## Changes
- `utils/landscapeFill.ts` (+test): pure rules. Landscape phone with a video and not fullscreen: enter. Landscape ends: exit only a fill the app made (fullscreen the user chose in portrait stays). User leaves the fill while landscape: suppressed until the next rotation.
- `components/useLandscapeFill.ts` (+test), used in `Player`: sets CSS immersive at once; the first `pointerup` after that asks for real fullscreen (touch activation happens on release, so pointerup not pointerdown; refusal ignored, immersive stays). Leaving real fullscreen (Android Back) while the fill is on also clears immersive and stays out. Resets its memory on unmount (React StrictMode remount otherwise looked like "user exited").
- `fullscreen.ts`: `requestRealFullscreen`, `isRealFullscreen`; `exitFullscreen` now leaves immersive and real fullscreen together.
- `FullscreenControls.tsx`: touch view (`coarse && mode !== 'off'`) has one tap area; a tap only shows/hides the controls (never plays); no left/right double-tap seek; Lock button and triple-tap glow gone there. Desktop/mouse path unchanged (click plays, dblclick fullscreen, verified at 1280x800).
- `Player.tsx`: video.js `userActions.doubleClick` false in the touch view. Zoom reset on container resize (`viewportChanged` in `utils/zoom.ts` + test; ResizeObserver) so rotating never leaves a stale pixel pan.
- `App.css`: `--tv-clear: 76px` replaces 52px for left cluster, Tag and moment chip: clears the 44px strip plus 3 stacked event-icon lanes (they reached 64px and overlapped the left cluster). `.tap-zone-all`.

## Checks
test:run 235 files / 2658 tests pass (exit 0); tsc exit 0; build ok; eslint 11 problems (baseline 11).
Red-green: FullscreenControls touch-view tests were written red first (4 failed) then green. The landscapeFill, fullscreen and zoom helper tests were written together with the code, not seen red.

## Browser (Playwright, Chrome, Android UA, port 5204, dark only)
844x390, 915x412, 740x360 with 9 clustered events (3 lanes): immersive on load, no cluster/icon rectangle overlap; first tap gives real fullscreen. 390x844 -> 844x390 -> 390x844 with zoom: zoom resets each rotation, picture whole, immersive and real fullscreen left on return to portrait. Double tap leaves state unchanged. Menu Exit fullscreen stays out until rotation. 834x1194 and 390x844 portrait band unchanged. 1280x800 desktop unchanged. Light theme not screenshotted.

## Not verified
Real Android device (activation timing for real fullscreen, Back behaviour, browser bars); the founder's non-fullscreen overlap could not be reproduced exactly, the fix is the geometry above. Pan itself was not exercised by touch drag (zoom by Z key only).

## Proposed AGENTS.md text
- Touch fullscreen / Touch view: "Turning a phone sideways (landscape layout, video loaded) fills the screen at once (CSS immersive) and the first tap asks for real fullscreen (`useLandscapeFill`, `utils/landscapeFill.ts`). Turning back leaves a fill the app made, not fullscreen the user chose in portrait; leaving it while sideways stays out until the next rotation. A tap on the picture only shows/hides the controls; there is no tap-to-play, no double-tap (seek zones, fullscreen) and no playback Lock in the touch view. Clusters sit at `--tv-clear` (76px) above the bottom edge."
- Picture gestures: "Touch view: a tap shows/hides controls. Any container resize (rotation, fullscreen) resets zoom to 1x and pan to 0."
- Decision (user): rotation fill, simplified gestures, 2026-10-20.
