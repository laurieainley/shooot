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
