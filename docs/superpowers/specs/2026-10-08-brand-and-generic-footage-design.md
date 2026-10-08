# Shooot Brand Rollout & Generic Footage — Design (Sub-project V)

**Date:** 2026-10-08
**Source:** user — "Review this brand design pack and implement it in the tool" (pack now at `brand/shooot/`, skill `.claude/skills/shooot-brand`); "genericise video files it works with away from GoPro and just towards video footage generally".

Read `brand/shooot/BRAND.md` and `.claude/skills/shooot-brand/SKILL.md` first. They are the source of truth; this spec records how they map onto this app and the decisions where the pack is silent or conflicts with earlier user choices.

## Decisions (made by the main session)

1. **Tokens:** Tailwind 4 (CSS-first) — do not use `tailwind.preset.js`. Import `brand/shooot/tokens.css` (minus its Google Fonts `@import`) and `motion.css` globally; map them in `src/index.css` `@theme` (`--color-ground: var(--sh-ground)` …). Replace the old tokens (`--paper/--panel/--sunk/--ink/--accent/--start/--danger/...`) everywhere; no raw hex in components (video overlays excepted, they read `tokens.json`).
2. **Themes:** dark default; light via OS or `[data-theme]` exactly as tokens.css does. `<meta name="theme-color" content="#0B0F0D">`.
3. **Fonts self-hosted** (no Google Fonts request): Archivo variable (wght 100–900, wdth 62–125, ital), Big Shoulders Display, JetBrains Mono — via `@fontsource-variable/archivo`, `@fontsource-variable/big-shoulders-display` (or `@fontsource/big-shoulders-display`), `@fontsource/jetbrains-mono`, or woff2 files under `public/fonts/`. Remove Barlow / IBM Plex / Bebas Neue.
4. **Red (`--sh-rec`) only for REC meanings:** playhead, the mark (＋) button's dot, render-in-progress ring/chip, notification badge, logo full stop. **Destructive actions are not red**: use chalk/outline buttons with explicit wording ("Delete event") plus the existing confirm/undo. Error text uses `--sh-text` with a warning icon, not red.
5. **Goals are lime.** Strip/scrubber: lime ticks for goals (incl. pen goals), grey ticks for other events, own goals chalk with "OG", penalty missed an open chalk ring; Kick off / Half time / Final whistle flags in chalk/muted. Playhead red. Team kit colours stay as small dots on event rows and the score badge only.
6. **Event tags** (log rows, picker, edit sheet): Goal = lime fill; Pen goal = lime outline; Own goal = chalk fill + "OG"; Save/Foul/Highlight/Penalty conceded/Penalty missed = surface-2 fill, chalk text, icon. Never red vs green alone.
7. **Type:** UI/body Archivo 100%; section headings = heading voice (900 italic 85% upper); team names/score badge = scoreboard voice; player names in the shirt font wherever a player is the hero (log rows' person, picker roster chips, captions, full-time card); clocks/scores/keys JetBrains Mono (tabular). Skew −10° on tags, score badge and in-reel bugs only.
8. **Wordmark:** `brand/shooot/assets/wordmark-on-dark.svg` / `-on-light.svg` by theme (inline or `<img>` with `prefers-color-scheme` + `[data-theme]`), min 96 px wide, replacing the live "SHOOOT" text. Product name in one constant (`src/brand.ts`: `PRODUCT_NAME = 'Shooot'`) used in `<title>`, copy, file names, diagnostics, "Made with Shooot".
9. **Icons:** copy favicon.svg/.ico, apple-touch-icon.png, icon-192/512, maskable to `public/`; `<link>` tags from BRAND.md; add a web app manifest (`name: Shooot`, `theme_color/background_color #0B0F0D`, icons incl. maskable).
10. **Motion:** net bulge (`.sh-net`) on: app launch/loading (files probing), "goal marked" confirmation (brief, after a goal is added), "reel ready". Reduced motion respected. No other new animation.
11. **Voice/copy:** sentence case UI, UK English, the pack's tone for empty/loading/done states (e.g. empty log "No goals yet. Classic.", render progress "Polishing the tap-ins… 64%", done "Reel ready. Group chat won't know what's hit it."). Keep instructions plain where users need to act (errors, relink, confirmations) — wit only in empty/progress/success states. "Shooot" in running text; never "SHOOOT" outside the wordmark.
12. **Primary button:** lime fill, on-lime text, 800 italic uppercase, ≥ 44 px, radius 10 (Export, Render, Mark event). Secondary: outline/surface-2.
13. **In-reel graphics (rendered video)** follow BRAND.md "In-reel graphics", keeping the user's earlier layout decisions:
    - **Captions stay top-left** (user's choice) with current timing (1 s after the moment, 5 s; highlights at clip start) and current overall size, restyled: score bug = skewed strip, team initials in scoreboard voice, score in mono on lime, 5 px kit-colour bars at the outer edges; event line = lime slab with the event word in stadium voice ("GOAL!", "PEN GOAL", "OWN GOAL" as chalk + "OG", "SAVE", "PENALTY MISSED" …) then a black bar with the player name in the shirt font (+ "Assist: X" line, note line, and the minute `'34`). No shirt numbers (not recorded).
    - **Replay tag:** "REPLAY 0.5×" (actual speed) top-right in mono; keep instant on/off.
    - **VS card:** split field in the two kit colours (multicolour = stripes), team names in scoreboard voice, lime "VS" roundel, matchday heading in heading voice, faint pitch markings, the club logo (T.N.F / user logo) kept.
    - **Full time:** "FULL TIME" tag, score in stadium voice, scorers in two columns (shirt font, minutes), faint pitch markings.
    - **End line** on the full-time card: "Made with Shooot ●" small, muted.
    - Canvas fonts: variable-width voices can't be relied on in canvas across browsers — generate **static instances** (fonttools `varLib.instancer`, subset to Latin + used symbols) for Archivo Stadium (wdth 125, wght 900, italic), Heading (85/900/italic), Scoreboard (72/800/italic), plus Big Shoulders 800 and JetBrains Mono 700, bundled as woff2 and loaded with FontFace before painting (extend `ensureGraphicsFonts`; keep text centring from measured metrics).
    - Colours from `brand/shooot/tokens.json` (import the JSON), not hard-coded.
    - Legibility tests (min pixel sizes, title-safe) keep passing; update thresholds only if the design genuinely changes size, never to hide a regression.
14. **CLAUDE.md:** add the Brand section from `brand/shooot/CLAUDE.brand.md`; update tech stack (fonts), file list (brand.ts, manifest).

## Generic footage (not GoPro-specific)

- **Accepted input:** any MP4 / MOV / M4V (and GoPro .LRV) with H.264 or HEVC video and AAC audio — phones (iPhone MOV HEVC, Android MP4), action cams, cameras. Update `fileAccept.ts` (`isAcceptedVideo`, accept list incl. `.mov,.m4v`, `video/quicktime`), probe (Mediabunny reads MOV), error messages. Audio-less files: allowed (silent audio handling already exists for replays; check cuts without audio work or reject with a clear message — prefer allowing, filling silence).
- **Ordering:** default order = GoPro chapter order when names match the GoPro pattern (keep `gopro.ts`), else by the file's recording time if Mediabunny exposes it (creation_time metadata), else `lastModified`, else name (natural sort). Users can still reorder.
- **Proxies:** keep GoPro LRV pairing as a feature, but describe it generically: "preview file" / "proxy" (".LRV previews from GoPro cameras"). Badges: "proxy" not "LRV".
- **Copy:** remove GoPro-first wording across the UI (empty state: "Drop your match videos here — any order. MP4 or MOV from a phone or camera."), render notes ("render the preview from the proxies"), "Preview full match (proxies)", file badges, hints ("add the matching GL….LRV" → "add a proxy file, or render on a computer"). Keep GoPro mentioned only where the feature is GoPro-specific (LRV pairing tip).
- **Engine:** no GoPro assumptions in rendering beyond data-stream dropping (drop any non-AV tracks). Variable frame rate phone footage: stream copy is fine; graphics paths use the footage's own frame timing (check `frameGrid`/frame duration logic copes with VFR — use per-packet timestamps, not a fixed GOP of 1.001 s). Keyframe snapping must not assume 1 s GOPs (phones often use 1–2 s; some up to 4 s). Mixed sources (phone + GoPro) keep the existing mixed-size handling.
- CLAUDE.md wording: "video files (MP4/MOV, H.264/HEVC + AAC) from phones or cameras; GoPro LRV proxies supported".

## Split (three parallel implementers)

- **V1 — Brand UI:** items 1–12 and 14 (UI copy except GoPro/footage wording).
- **V2 — Brand video graphics:** item 13 (src/graphics/*, fonts for canvas, tokens.json import). No UI component changes except Export panel labels if needed.
- **V3 — Generic footage:** the "Generic footage" section (utils/fileAccept, probe, gopro/ordering, addFiles, FilePills badges, EmptyPlayer/footage copy, render-side VFR/GOP assumptions).

Overlap: V1 and V3 both touch copy in EmptyPlayer/FilePills/FullMatchExport — V3 owns the footage wording in those files, V1 owns styling. Merge order V3 → V2 → V1 (V1 resolves conflicts last).

## Testing
Red-green for all pure functions (ordering, accept, tag style mapping, caption layout, font instance loading guard). Browser screenshots at 390×844, 844×390, 834×1194, 1440×900 in dark and light; contrast spot-checks with a script for key pairs. Real renders for V2 (look at frames: caption, replay tag, VS card, full time) and V3 (an iPhone-like MOV HEVC + an Android-like VFR MP4 → highlights and full match decode clean).
