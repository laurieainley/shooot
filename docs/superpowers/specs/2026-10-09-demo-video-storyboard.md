# Shooot Hero Demo Video — Storyboard (draft for approval)

**Date:** 2026-10-09 · **Format:** 16:9, 1920×1080, 30 fps · **Deliverables:** (1) **Teaser loop** ≈18 s, silent,
autoplays muted above the fold; (2) **Full demo** ≈80 s, music + a few voiceover lines + burned-in captions, opened by
"▶ Watch the 80-second demo (sound on)".
**Audience:** UK five-a-side players (and organisers) landing from a WhatsApp link or social post, on a phone or laptop,
deciding in ~20 s whether to join the waitlist. They know the pain (nobody films, nobody edits) and the banter.
**Goal:** "That's our Thursday game, on telly — I want that" → Join the waitlist.
**Source material:** real match `project-alo.json` (Whites 8–12 Colours; 28 tags across GX010278–GX040278), the real
editor (Playwright screen recordings of editor.shooot.co.uk, using the LRV proxies for smooth playback), real 4K
GoPro clips for the reel shots, the app's own Shooot-theme graphics for in-reel overlays. Players have agreed to appear.
**Brand:** Night Turf · Lime (brand/shooot/BRAND.md): stadium/heading/scoreboard voices of Archivo, Big Shoulders for
names, JetBrains Mono for clocks; lime = goals/primary; red REC dot = live/recording; skew −10°; motion feels like
editing (trims, wipes, speed ramps) — no camera shake, no white flashes; faint pitch lines only on hero moments.

## Signature motif: the REC dot becomes the ball
A red REC dot blinks (recording) → it's kicked: it becomes a 3D football (lime-seamed, dark panels) that flies into the
top corner of the wordmark's loud O → the O bulges like a net (the brand's net-bulge) → settles as the red full stop of
SHOOOT. Used in: opening (full), transitions (short whip of the ball), and the end card (full, slower).

## Music & sound
- ElevenLabs Music: ~120 BPM UK garage / grime-tinged broadcast sting energy, punchy drums, stadium-chant vocal chops
  (no lyrics), with a clear drop at the "Shooot" reveal; 80 s with a clean 18 s loopable section for the teaser.
- ElevenLabs SFX: REC beep, ball strike, net ripple ("swish"), crowd "ooh" on the penalty miss, crowd roar on GOAL!,
  whistle for Kick off / Full time, UI ticks on tags. Cuts land on beats (beat grid from the BPM).
- Voiceover (full version only, ElevenLabs, UK male or female, dry and knowing, not shouty): 5 lines, ≤ 30 words in
  total, captioned. Proposed lines are marked **VO** below.

---

## A. Teaser loop (≈18 s, silent, loops seamlessly)

| t (s) | Picture | On-screen text (stadium/heading voice) |
|---|---|---|
| 0.0–2.0 | Black turf. Red REC dot blinks top-left over real GoPro footage of the sports hall (wide, 4K, slight push-in). | "THURSDAY. 8PM." (mono, small) |
| 2.0–4.5 | Real goal (Sam L, assist A Lo). Ball hits the net; freeze-frame on contact with a lime outline wipe. | "WORLDIE." → strike-through → "NOBODY SAW IT." |
| 4.5–8.0 | Cut to the editor (real recording): GoPro files drop in, the timeline fills; press **G** → tag picker → Goal → Whites → Sam L. Cursor + keycaps shown. | "TAG IT." (lime slab) |
| 8.0–13.0 | The rendered reel: the same goal with the Shooot scorebug WHI 3–1 COL, "GOAL! SAM L" caption slides in at −10°, then the slow-mo replay zoomed on the goal mouth with "REPLAY 0.5×". | "AS SEEN ON TELLY." |
| 13.0–16.0 | Phone in hand (2D device mock) with a WhatsApp group: reel arrives, reactions pop (😂🔥⚽), "NOT THE OWN GOAL 😭". | "SEND IT." |
| 16.0–18.0 | REC dot → ball → net bulge → SHOOOT. wordmark; button-like slab. | "Free early access" → loops to 0.0 (the blinking REC dot matches the first frame) |

## B. Full demo (≈80 s, sound on)

### 1 · Hook (0–8 s)
- 0–3: REC dot blinks; real wide shot of the hall; whistle SFX. Kick off. Title in mono: "THURSDAY 5-A-SIDE · WHITES v COLOURS".
- 3–8: Quick-fire real moments cut to the beat (Ryan finish, Joe save, Sam L goal) each frozen with a lime freeze-frame outline. **VO:** "Every week, someone scores a worldie."

### 2 · The problem (8–20 s)
- 8–13: 2D split-screen gag: left "PHONE IN BAG" (icon), right "GOPRO ON A BOTTLE" filming… 60:00 counter racing. Then an editing timeline UI (generic, grey) explodes into dozens of clips, scrub bar overflowing, "Export 4h 12m remaining" spinner. **VO:** "Then it's lost in an hour of footage nobody's ever going to edit."
- 13–20: The group chat (2D phone mock): "did anyone get that??", "was it in?", "ref 🙄". Counter: "0 replays". Gentle crowd groan SFX.

### 3 · Why it matters (20–28 s)
- 20–28: Real clips of the banter-worthy moments: A Lo's two penalty misses back-to-back (crowd "ooh" ×2, caption "PENALTY MISSED · A LO" twice — the app's real caption), Jak's own goal ("OWN GOAL · JAK  OG"). Text: "EVERY GOAL DESERVES A REPLAY." beat "EVEN THAT ONE." **VO:** "Every goal deserves a replay. Even that one."

### 4 · Shooot reveal (28–33 s)
- Motif in full (3D): REC dot is kicked → ball flies → net bulge in the O → "SHOOOT." on the drop. Tagline: "Your five-a-side, as seen on telly."

### 5 · How it works — real app, beat by beat (33–68 s)
Screen recordings of the real editor (dark theme), framed in a floating 3D-tilted browser window over turf with faint pitch lines; each feature gets a lime step label and a keycap/gesture callout.
1. **Film it (33–37):** GoPro on a bottle (2D illustration) → "GoPro, phone, whatever you've got." Files GX010278…GX040278 drop into the editor; timeline builds across 4 chapters.
2. **Tag it (37–47):** watch → press **G** → picker: Goal → Whites → Sam L → Assist: A Lo. Icons pop on the timeline (⚽ / 🧤). Speed-ramp through the match as tags rain onto the strip (28 tags). **VO:** "Watch it back. Tap when something happens."
3. **Setup (47–51):** Match setup: team names, kit colours, drag the goal-area boxes over each goal mouth (for replay zoom).
4. **Replays + captions (51–58):** Export → Highlights → Render: progress "Polishing the tap-ins… 64%"; cut to the rendered output: VS card (WHITES v COLOURS, matchday), goal caption, replay zoom, REPLAY 0.5×, full-time card 8–12 with scorers in two columns.
5. **Full match + YouTube (58–63):** Export full match with score bug after goals; "Copy YouTube description" → chapters text types out.
6. **Send it (63–68):** Share sheet → WhatsApp group; reactions pop; "Group chat won't know what's hit it." **VO:** "Shooot cuts the goals, the replays, the scoreboard. You just send it."

### 6 · Payoff + CTA (68–80 s)
- 68–74: Montage of the finished reel (real 4K, Shooot graphics), cuts on beats, ends on Laurie's last goal + full-time card.
- 74–80: Motif end card: ball → net bulge → SHOOOT. · "Your five-a-side, as seen on telly." · lime button "Join the waitlist — free early access" · "shooot.co.uk". Final whistle SFX on the last beat.

## Production plan
- **Tool:** Remotion (React) in `video/` (own package; not part of the app build), compositions `Teaser` (18 s loop) and `Demo` (80 s). Three.js via `@remotion/three` for the ball/net; 2D in SVG/CSS with brand tokens; real graphics reuse `src/graphics` painters where possible.
- **Real app capture:** Playwright records the editor at 1920×1080 (deviceScaleFactor 2 crops for close-ups) with the LRVs + `project-alo.json`, scripted beat by beat (cursor overlay added in Remotion).
- **Real footage:** ffmpeg extracts only the needed 4–8 s windows from the 4K MP4s (transcoded to 1080p ProRes/H.264 intermediates, small), plus one Shooot-rendered highlights reel of the featured goals.
- **Audio:** ElevenLabs Music (80 s + loop section), SFX, TTS (5 lines); beat grid from BPM; captions burned in.
- **Output:** `demo-hero-loop.mp4` (H.264 + WebM, ~2–4 MB, muted, poster image) and `demo-full.mp4` (H.264, ~15–25 MB), embedded on shooot.co.uk: autoplay muted loop + "Watch the demo" lightbox with sound; `preload="metadata"`, poster, reduced-motion users see the poster with a play button.

## Open questions for approval
1. Voice: male or female, and how cheeky (dry/knowing vs. a bit more "lad")?
2. Any moment from the match you particularly want featured (beyond Sam L's goal, A Lo's double penalty miss, Jak's own goal, Ryan's finish, Joe's save)?
3. Music direction OK (UK garage/grime-tinged broadcast energy, no lyrics), or something else (e.g. Champions-League-ish orchestral pastiche, indie)?
