# Shooot — Brand guide v1

**Direction:** Night Turf · Lime. Modern broadcast energy on a near-black with a hint of turf, faint pitch markings, a lime accent and one red record dot.

## Positioning

**Hero line:** Your five-a-side, as seen on telly.

**Landing page (v1):** hero "Your five-a-side, as seen on telly." Steps: Film it · Tag it · Send it. Use "telly" once per page; Match of the Day / Monday Night Football only as comparisons in body copy, never in logos or headlines alongside their branding.

**Summary:** Shooot turns the hour of footage from your weekly five-a-side into a proper highlights show. Drop in your GoPro or phone clips, tag each moment as it happens, and Shooot cuts every goal with a slow-motion replay, a live scorebug and a full-time card, ready for the group chat or YouTube in minutes. It's built for amateur players who want their worldies remembered (and their misses quietly forgotten), and it's growing into a home for match stats, player ratings and AI-spotted highlights across football, padel, tennis and beyond.

**Alternate lines:**

- Monday Night Football. Sunday League effort. *(product / features)*
- No editing. No faff. *(how it works)*
- Film it. Tag it. Send it. *(the three steps)*
- Every goal deserves a replay. Even that one. *(self-aware)*
- From GoPro to group chat before your pint goes flat. *(self-aware)*
- Bragging rights, rendered. *(short)*
- Top bins. Now in slow-mo. *(social)*

**Social bio (≤150):** Your five-a-side, as seen on telly. An hour of match footage → a highlights reel in minutes. Made for the group chat ●

**Reel end-line:** Made with Shooot ● shooot.[domain]

## Voice

Loud, knowing, never mean. It sounds like the funniest person in the group chat who also happens to be a TV producer.

- Do: "No goals yet. Classic." · "Polishing the tap-ins…" · "Reel ready. Group chat won't know what's hit it." · "That file's offside — try the full .MP4."
- Don't: mock individual players, use corporate filler ("Leverage your footage"), or overuse exclamation marks. One "GOAL!" is enough.
- UK English, football vernacular (worldie, top bins, tap-in, nutmeg, five-a-side), sentence case in UI copy, UPPERCASE italic for display moments only.

## Name and logo

- The name is **Shooot**: three Os, with a capital S only. Never write SHOOOT in running text (the wordmark is uppercase by design), and never Shoot or Shoooot.
- The **wordmark** is SHOOOT in Archivo 900 italic. Each O is wider than the last (width 62% → 90% → 125%): the shout getting louder, and the shot becoming a shoot. The loudest O is lime on dark. The **red record dot** is the full stop.
- Files: `assets/wordmark-on-dark.svg`, `assets/wordmark-on-light.svg` (the loud O sits on a lime highlight), `assets/wordmark-mono.svg` (currentColor). Glyphs are outlined, so no font is needed.
- Clear space: the height of the dot on all sides. Minimum width: 96px on screen.
- Never: recolour the dot, put lime type on light backgrounds, add effects such as outlines or shadows, or stretch the Os differently from the spec.

## App icon and favicon

- **Static mark = "S."**: a lime italic S with the red dot as its full stop, on Ground `#0B0F0D`. It's used for the app icon, favicon, social avatar and merch.
- Variants: `icon-app.svg` (primary), `icon-app-lime.svg` (campaigns, store feature tiles), `icon-app-mono.svg` (tinted/monochrome OS modes), `icon-maskable.svg` (Android adaptive, inside the safe zone).
- PNGs: `icon-1024/512/192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180), `favicon-16/32/48.png`, `favicon.ico`, `favicon.svg`.

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0B0F0D">
```

## The signature move: net bulge

The O is a goal. The red dot is shot into its top corner, and the O stretches like a net taking the ball, then settles. It's the brand's motion signature, so use it **only in motion**: app launch, loading, "goal marked" confirmation, "reel ready", and the end of the ident. As a still image, use the S. icon instead. Implementation: `motion.css` (`.sh-net`, 900ms, `.is-playing` / `.is-looping`).

## Colour

| Token | Dark | Light | Use |
|---|---|---|---|
| ground | `#0B0F0D` | `#F1F3EE` | Page background |
| surface | `#141B17` | `#FFFFFF` | Cards, panels |
| surface-2 | `#1A2420` | `#E8ECE5` | Hover, selected rows |
| line | `#24302A` | `#D5DDD3` | Borders, dividers, tracks |
| text | `#F3F1EA` | `#0A0D12` | Body and headings |
| muted | `#8E9A92` | `#56625A` | Secondary text |
| lime | `#A8F03C` | `#A8F03C` | Primary action, the loud O, goals |
| lime-text | `#A8F03C` | `#3F7A00` | Lime-coloured text and links |
| rec | `#FF3D2E` | `#FF3D2E` | The REC dot only |
| on-lime | `#0A0D12` | `#0A0D12` | Text on lime, always |

Rules:

- **Lime is a fill on light backgrounds, never text.** In light mode use `lime-text #3F7A00` for links and coloured text, and use lime as highlight blocks, buttons and tags.
- **Red is the REC dot and nothing else.** It means "live, now or recording": the mark button, the playhead, the scorer pulse, the render ring, notification badges and the full stop. It never encodes data. Goals and moments on timelines and shot maps are lime ticks or dots; misses are open chalk rings.
- **Kit colours** (team bibs) are user-picked and appear only as small dots and bars on scorebugs and line-ups. They never become brand colours.
- **Pitch markings** (`--sh-pitch`): faint pitch lines behind hero moments (idents, title cards, empty states, shot maps). No mowing stripes, no grass textures.
- Never pair red and green as the only difference between two meanings (e.g. goal vs own goal). Add a label or icon, for colour-blind users.

## Type

| Voice | Font | Setting | Use |
|---|---|---|---|
| Stadium | Archivo | 900 italic, width 125%, uppercase | "GOAL!", hero moments |
| Heading | Archivo | 900 italic, width 85%, uppercase | Section titles, cards |
| Scoreboard | Archivo | 800 italic, width 72%, uppercase | Team names, scorebugs, captions |
| Body / UI | Archivo | 400–700, width 100% | Everything else |
| Shirt | Big Shoulders Display | 800 names (tracked +0.08em), 900 outline numbers | Player names and numbers only |
| Clock | JetBrains Mono | 400 / 700 | Timecodes, scores, keyboard keys |

- Shirt type is a **second voice for players**. Use it wherever a player is the hero (goal captions, player cards, line-ups, ratings). Never use it for the brand or UI.
- Scale: 13 · 15 · 17 · 20 · 28 · 40 · 64px. 4px spacing grid. Radii 6 / 10 / 16.
- Tags, lower thirds and scorebugs lean `skewX(-10deg)`. Body text never leans.

## Components (core patterns)

- **Primary button:** lime fill, on-lime text, 800 italic uppercase, at least 44px tall, radius 10.
- **Scorebug:** skewed strip with team name (scoreboard voice), score in mono on lime, opponent, then clock in mono. 5px kit-colour bars at the outer edges.
- **Event tags:** Goal = lime fill · Pen goal = lime outline · Own goal = chalk fill + "OG" label (not red) · Save, Foul, Highlight = surface-2 fill with chalk text and icon.
- **Mark pad:** one big lime GOAL button (keyboard G) plus secondary Highlight / Save / More. Touch-first, with the keys shown as keycaps.
- **Timeline:** line track with lime goal ticks, grey ticks for other moments, and the red dot as the playhead.
- **Toasts** carry the voice: "Polishing the tap-ins… 64%", "Reel ready. Group chat won't know what's hit it."

## In-reel graphics (rendered into videos)

1. **VS card** (3s): split field in the two kit colours, team names in scoreboard voice, lime "VS" roundel, matchday heading.
2. **Goal caption** (5s, slides in at −10°): lime "GOAL!" slab in stadium voice, then a black bar with the shirt-type number, name and minute.
3. **Replay tag**: "REPLAY 0.5×" top-right in mono. Replays zoom on the goal area.
4. **Full time** (6s): "FULL TIME" tag, score in stadium voice, scorers in two columns.
5. **Ident** (4s, opening and closing reels): the logo shout with the net-bulge sign-off. The concept is still being explored. No camera-shake or white-flash effects: motion should feel like editing (trims, wipes, speed ramps), not photography.

## Accessibility

- Text contrast ≥ 4.5:1 (3:1 at 24px+). Checked pairs: text/ground, muted/ground, on-lime/lime, lime-text/light ground.
- Touch targets ≥ 44px. Real `<button>` / `<a>` elements. `aria-label` on icon-only buttons.
- Respect `prefers-reduced-motion`: show the final frame and skip the bulge, shout and pulse.
