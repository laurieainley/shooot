# Ideas worth introducing later

Running log of improvements noticed while building. Not committed to; for the user to pick from.

- **Assists** on goals (optional second person step) — natural extension of the scorer step; chapters "Goal (Sam, assist Jo)".
- **Half-time / second-half markers** — a "Half time" event type; useful for chapters and for auto camera select (#9: teams swap ends).
- **Render queue / background render** — keep editing while the full render runs; notify when done (Web Notifications on desktop).
- **Remember last-used folder / files per match** — File System Access API on desktop can reopen the same files without re-picking (not on Android).
- **Bigger read blocks or parallel reads on Android** — 8 MB blocks gave ~2.5× speed-up; two blocks in flight may help USB latency further.
- **Lightweight logo asset** — ship a 512 px WebP of the T.N.F badge instead of the 7 MB PNG.
- **Shareable match summary page** — final score, scorers and chapter links as an artifact/page to post in the group chat alongside the YouTube link.
- **Clip trim handles** — per-event before/after overrides by dragging the clip span on the match strip.
- ~~**Duplicate-mark guard**~~ — done in the mobile polish pass (picker warns when a mark lands within 3 s of another).
- **Landscape phone layout** — side-by-side (video left, event log right) like desktop, with a compact top bar; *(Done in the mobile polish pass.)*
- **iPhone fullscreen** — iOS Safari only fullscreens `<video>`, so the container fullscreen (overlays, ＋, picker) can't work there; a "focus mode" (CSS full-viewport, hide chrome) would give a similar experience on iOS. *(Mobile polish added this as the immersive fallback; untested on an iPhone.)*
- **Graphics preview in the player** — show lower thirds/cards over the video during in-app Preview using the same layout functions, so what you see matches the render.
- **Unify scrub bubble and match clock** — the scrub bubble shows file time; the strip label shows match time once a kick-off is set.
- **Vertical (9:16) clips with automatic reframing** (2026-10-10) — for sharing single highlights. Signal options, most robust first: follow the player cluster/motion (people are easy to detect; the ball at five-a-side wide angle is a few pixels and often hidden); bias towards the attacking goal at the moment of a goal (goal areas already exist); frame differencing / optical flow on the LRV (no model); in-browser detectors (YOLOv8/YOLO11 ONNX via ONNX Runtime Web + WebGPU, or MediaPipe object detector) on the LRV. Whatever the signal, a virtual camera (Kalman / one-euro smoothing + dead zone). Safest first version: user sets the crop at 2–3 keyframes, interpolated.
- **Steer Find goals with the known final score** (2026-10-12) — rank suggestions, keep at least N top picks, stop early once the count is reached (the known final score is entered in New match / Match setup; today it only drives the "N to find" signal).
- **Broadcast-style team intros from one photo per player** (2026-10-23, user) — an opening sequence like TV line-ups:
  per team, a collage of the five players' headshots in the team's kit fades/animates in with the team name, then each
  player with very slight movement (arms folded, a small step towards the camera, a blink or head turn). Made from a
  single photo per player. Builds on the existing line-up title card (`cards()` in graphics/plan.ts, 7 s `INTRO_SEC`)
  and the rosters. Ways to get there, cheapest first:
  1. **Local, no AI video:** cut the player out of the photo in the browser (person segmentation, e.g. MediaPipe), lay
     the cut-outs on the brand ground and animate them on the canvas (staggered slide/scale-in, slow push-in, light
     parallax). Fits "video never leaves the device"; no face movement.
  2. **Kit:** tint the shirt to the team's kit colour (segment the torso), or ask players for a photo in the shirt.
  3. **Subtle motion:** a portrait-animation model (open source, e.g. LivePortrait) or a hosted image-to-video model for
     the "fold arms / walk to camera" moves. Hosted models mean sending players' faces to a third party: needs a privacy
     decision (consent of each player, UK GDPR) and a cost check. Generate once per player and reuse every match.
  Open questions: where players' photos live (per device today, like `knownPlayers`), consent, and how long the intro
  can run before people skip it.
