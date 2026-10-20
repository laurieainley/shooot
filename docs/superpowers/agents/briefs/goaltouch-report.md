# goaltouch report (branch feat/goal-touch, worktree .claude/worktrees/goaltouch)
Status: done, green, one commit (not merged/pushed).

Changes
1. utils/blackFrame.ts (+test): isNearBlack(rgba). frameGrab.ts grabFrame now waits for requestVideoFrameCallback (250 ms fallback) after seeked, probes a 16x16 copy, and if black waits 250 ms, rechecks, then nudges +0.1 s and draws on the next seeked. Applies to every grabFrame/useFrameAt/useStillAt user.
2. useGoalPicture(url,duration,time,sharp,fullFile): sharp 3840 still from an object URL of first.fullFile (created/revoked in an effect, waits until made); chooseStillUrl falls back to the playback URL if the full file's grab errors. Thumbnails/scrub stay on the playback file. Marks are normalised, untouched.
3. PostPlacer: no auto-pan between points; one-shot start view for the first point only.
4. Crosshair tap (touch, within 44 px of centre, finger moved < 6 px) = Set point (places under the crosshair, not under the finger). Panning starts only after 6 px so a tap does not wobble the picture. Instruction + aria text: "...then tap the crosshair or press Set point". Landscape short (max-height 500): right column head scrolls, controls pinned at the bottom, compact buttons, diagram 76 px, optional-corners note hidden (prompt says optional). Desktop (>=1024) layout unchanged.
5. Touch edit: tap a placed dot (hit test in the view's pointerup, 28 px, dots stay pointer-events none) or its diagram point (role=button "Move point N: ...") -> GoalSetup editKey makes it current, picture centres on it, Set point / crosshair tap replaces it, then current returns to the next unplaced point. Undo/any marks change clears it. Note when all six set on touch: "Tap a dot to move it."
6. ZOOM_INSTRUCTION replaced with the requested copy; test updated.
CSS: only .gs-* rules (landscape block + .gs-diagram__pt--pick/hit).

Tests: red->green for isNearBlack (helper), still URL choice (4 tests incl. fallback + revoke), no-jump, crosshair tap near/far/drag, instruction text, dot tap-to-edit, diagram pick, copy. Changed the old "jump to next point" test into "keep the view".
Checks: test:run 227 files / 2562 passed; tsc 0; build ok (exit 0); eslint 11 problems (baseline, none added); contrast ok.

Screenshots (scratchpad/goaltouch-shots, dark+light, 390x844, 844x390, 915x412, 834x1194, 1280x800, every step incl. 5/6 in landscape + touch edit via diagram): looked at 844/915 landscape steps 5-6 (Set point visible with Next/Undo/Back/Skip), 390 portrait edit, 834 portrait, 1280 desktop, zoom step copy. Thumbnails all six rendered (synthetic clip, so black-frame retry not reproduced locally).

Not verified / needs a real Android device: black thumbnails 1 and 3 (the real cause), full-MP4 still decoding of a large GoPro file via object URL (memory/time on phone), real finger taps on dots/crosshair (Playwright touchscreen.tap only on crosshair; dot-tap covered by unit test with pointer events).

Proposed AGENTS.md text (Goal areas / goal set-up): "Touch: tap the crosshair or Set point to place; tap a placed dot or its diagram point to move it (the view no longer jumps between points). The sharp still comes from the full MP4 when a proxy is playing (falls back to the proxy). grabFrame waits for the painted frame and retries once if black (utils/blackFrame.ts). Short landscape: text column scrolls, buttons pinned."
Proposed DECISIONS entry: 2026-10-20 agent: goal set-up touch fixes after Android test; no auto-pan between points; crosshair tap sets point; dot tap edits; still from full file.
