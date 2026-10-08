---
name: shooot-brand
description: Apply the Shooot brand (Night Turf · Lime) to any UI, copy, icon, page or rendered video graphic in this repo. Use before building or changing anything user-facing.
---

# Shooot brand

The source of truth is `brand/shooot/BRAND.md`. Read it before any UI, copy or video-graphics work, then:

1. **Styles:** import `brand/shooot/tokens.css` and `brand/shooot/motion.css` once, globally (or use `brand/shooot/tailwind.preset.js`). Use `var(--sh-*)` tokens, never raw hex.
2. **Assets:** use the files in `brand/shooot/assets/` (outlined wordmarks, S. icons, favicons). Never retype the wordmark as live text, except when animating it with the `.sh-shout` pattern.
3. **Video renderer:** read colours, fonts and timings from `brand/shooot/tokens.json`.
4. **Check your work:** open `brand/shooot/preview.html` to compare.

## Rules that are easy to get wrong

- **Name:** Shooot in running text (three Os, capital S only). The wordmark is SHOOOT.
- **Red** (`--sh-rec`) is only for the REC dot: live, now or recording (mark button, playhead, scorer pulse, render ring, badges, the logo's full stop). Never use it for data. Goals are lime; own goals are a chalk tag with an "OG" label.
- **Lime is never text on light backgrounds.** Use `--sh-lime-text`. On light, lime is a fill (buttons, tags, the highlight behind the loud O, via `--sh-loud-o` / `--sh-loud-o-bg`).
- **Text on lime** is always `--sh-on-lime` (#0A0D12).
- **Fonts:** Archivo for brand and UI, using its display voices (stadium 125% / heading 85% / scoreboard 72%, 900–800 italic, uppercase). Big Shoulders Display only for player names and numbers. JetBrains Mono for clocks, scores and keys.
- **Skew:** tags, lower thirds and scorebugs lean `skewX(-10deg)`. Body text never does.
- **Static icon is "S."**; the **net bulge** (`.sh-net`) is for motion only: launch, loading, goal marked, reel ready.
- **Motion** should feel like editing (trims, wipes, speed ramps). No camera shake or white flashes. Respect `prefers-reduced-motion`.
- **Voice:** loud, knowing, never mean. UK English, football vernacular. Sentence case in the UI, uppercase italic only for display moments. Empty and loading states carry the voice ("No goals yet. Classic." / "Polishing the tap-ins…").
- **Accessibility:** contrast ≥ 4.5:1, touch targets ≥ 44px, real buttons and links, and never red vs green alone to tell two meanings apart.
