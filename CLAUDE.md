# CLAUDE.md — Shot Stopper

## Project Overview

Shot Stopper (branded "SHOOOT") is a browser-based video highlight editor. Users load one or more MP4 files, scrub through the footage, mark events (goals, key moments) at specific timestamps — either manually or via keyboard shortcuts — and render a concatenated highlight reel. The render uses Mediabunny to remux the encoded packets of each segment into one MP4 (no decode, no re-encode), keeping output fast and lossless relative to the source. GoPro HEVC MP4s and their `.LRV` proxies load directly.

The tool is designed around football/soccer match footage (the primary use case is marking goals), but the workflow is deliberately generic — any MP4 content with discrete moments worth clipping works the same way.

### Core workflow

1. **Load MP4s** — drag/drop or file picker; multiple files form a single ordered timeline.
2. **Mark events** — press **G** while playing to add a goal at the current playback position, or enter timestamps manually. Each event records the time, source file, and optional team/scorer metadata.
3. **Configure clip padding** — set how many seconds before and after each event to include (defaults: 10s before, 4s after). Overlapping segments are automatically merged. Scoring events also get a silent **slow-mo replay** (default 3 s before → 1 s after the moment at 0.5×, configurable in Clip settings; per-event ↻ toggle overrides the default) placed straight after their clip.
4. **Preview** — step through the generated segments in-player before committing to a render.
5. **Render** — `renderReel()` copies each segment's video and audio packets (snapped to keyframes) into a single MP4 streamed to OPFS, then offers a download / share. With LRV proxies there is a quick **Preview reel** (from the proxies) and a **Full quality render** (from the paired MP4s).
6. **Export chapters** — generate YouTube-format chapter markers from the goal list.

### Export modes (Export panel, two tabs)

- **Export highlights** — the reel above. Graphics: VS / full-time cards, **event captions** (top-left score bug + event line, drawn 1 s after the marked moment for 5 s, fading in and out), **REPLAY tag** (top right, appears and disappears instantly). Plain highlights reels are stream-copied; only short windows around graphics are re-encoded.
- **Export full match** — from **Kick off (K)** to **Final whistle (W)** across the files (both are events; the match clock starts at Kick off). Stream-copied; only the optional score bug moments (Off / After goals / Periodic every N min) and cards are re-encoded.
- Renders run in a job manager outside the panel (progress chip in the top bar, Export button shows a pressed state while open and a striped one while rendering, auto-download once, inline-confirmed Cancel). Units are saved to OPFS so a render can be **resumed** after a reload. Copy buttons give the YouTube description and goalscorers; a **Relink** banner reopens files after a reload (file handles remembered on desktop Chrome/Edge).
- Graphics text is centred from measured canvas metrics (`graphics/paint.ts`) after fonts are loaded (`ensureGraphicsFonts`), never from per-platform baseline guesses.

## Tech Stack

- **React 19 + TypeScript** — strict mode enabled
- **Vite 7** — dev server runs on `https://localhost:5174` (HTTPS required: OPFS and phone testing need a secure context)
- **Zustand 5** — global state (`src/state.ts`)
- **Mediabunny** — in-browser MP4 demux/remux for probing and rendering (packet copy, no re-encode)
- **Fonts** — self-hosted via `@fontsource-variable/archivo` (wght + wdth), `@fontsource-variable/big-shoulders-display`, `@fontsource/jetbrains-mono` (no Google Fonts request)
- **Video.js 8** — player with keyboard hotkeys (`videojs-hotkeys`)
- **idb-keyval** — IndexedDB persistence for goals and settings
- **Vitest + React Testing Library + happy-dom** — unit and integration tests (see Testing below)

## Key Commands

```bash
npm run dev       # Start dev server (HTTPS on port 5174)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint check
npm test          # Run Vitest tests (watch mode)
npm run test:run  # Run tests once (CI)
npm run test:ui   # Vitest UI
```

## Architecture

```
src/
  types.ts          # Shared types: Goal, VideoSourceFile, TimelineFile
  brand.ts          # PRODUCT_NAME ('Shooot') — the only place the name is spelled; wordmark art lives in brand/shooot/assets
  state.ts          # Zustand store — single source of truth
  App.tsx           # Undo/redo keys, default-video loader, renders <AppShell/>
  index.css         # Theme tokens (light + dark via prefers-color-scheme) mapped into Tailwind @theme; fonts
  App.css           # Edit-bay component styles on the tokens (no hard-coded colours except video overlays)
  components/       # One component per file, named exports
    AppShell.tsx    # Edit-bay grid: ≥900px one screen (player + strip | event rail, key hints); <900px stacked + FAB
    TopBar.tsx      # Wordmark, FilePills, ScoreBadge, Match, Export (phone: files + Match in ⋯ sheet)
    Wordmark.tsx    # Outlined wordmark, one SVG per theme
    EventTag.tsx    # Skewed event-type tag + line icons (utils/eventStyle.ts decides tone)
    NetBulge.tsx / GoalMarked.tsx # Brand net-bulge motion: loading, goal marked, reel ready
    ScoreBadge.tsx  # Team dots + names + scoreboard digits
    MatchStrip.tsx  # Whole-match overview: files end to end, clip spans, event dots, kick-off flag, playhead; click/drag seeks
    EventLog.tsx    # Dense keyboard event list (L focus, ↑↓, ⏎, ⌫, R replay, E scorer, T team, Esc), inline edit, paste list
    ClipSummary.tsx # Rail footer (clip / replay / reel length); opens ClipSettings
    ClipSettings.tsx          # Clip padding + replay before/after/speed
    ExportPanel.tsx # Export popover/sheet: preview in player, RenderHighlights, ChaptersCopy, ProjectIO
    FloatingPanel.tsx         # Anchored popover on desktop, bottom sheet on phone (portalled to body)
    ProjectIO.tsx   # Export / import project JSON
    KeyHints.tsx    # One-line shortcut hints (desktop)
    Fab.tsx         # Phone ＋ mark-event button
    Player.tsx      # Video.js player with hotkeys (G mark, Z zoom, 0 reset zoom, <> speed, etc.)
    useZoomPan.ts   # Zoom 1/1.5/2×, clamped pan, pinch (used by Player); ZoomChip.tsx shows the level
    useMediaQuery.ts          # matchMedia hook; DESKTOP_QUERY = (min-width: 900px)
    addFiles.ts     # addPickedFiles(): attach full MP4s to loaded proxies, probe + append the rest
    FilePills.tsx   # File pills (reorder, remove, badges) + AddFilesButton
    EmptyPlayer.tsx # Drop zone shown in the player cell before any file is loaded
    EventPicker.tsx           # G → type → team → scorer picker (popover; touch: grouped list in the events column)
    MatchSetup.tsx            # Teams, colours, rosters, match start
    TimelineMarkers.tsx       # Event / match-start markers portalled into the scrubber
    ChaptersCopy.tsx          # Copy YouTube / highlight chapters
    TimeInput.tsx             # Shared mm:ss time field
    fullscreen.ts             # Redirects video.js fullscreen to the player container
    RenderHighlights.tsx      # Preview/full render buttons, missing-file prompt, progress, download/share
    PreviewControls.tsx       # Start in-player preview; prev/next/exit bar while previewing
    FullscreenControls.tsx    # Tap zones (touch) + overlay controls in fullscreen
  utils/            # Pure functions only — no React, no side effects
    highlights.ts   # mergeOverlappingGoalSegments()
    timeline.ts     # computeCumulativeOffsets(), formatHMS(), formatEventClock()
    matchStrip.ts   # buildMatchStrip(), globalToFileTime()
    zoom.ts         # ZOOM_LEVELS, nextZoom(), snapZoom(), clampPan()
    reel.ts         # reelSummary() (reel length + clip count from the render plan), formatReelLength()
    bulkPaste.ts    # parseBulkLine(), parseBulkPaste()
    chapters.ts     # generateYouTubeChapters(), generateHighlightChapters()
    eventTypes.ts   # Event type metadata, picker options, isScoring(), migrateEvent()
    eventPicker.ts  # Pure picker reducer (type → team → scorer)
    roster.ts       # parseRoster(), filterRoster(), teamShortcuts(), rosterTeamFor()
    eventStyle.ts   # eventTone(), tagText(), stripTick(): tag and tick style by event type
    voice.ts        # Brand-voice strings for empty / progress / success states
    markers.ts      # markersForFile(), startInFile(), homeTarget()
    probe.ts        # codec/duration via Mediabunny + browser playability
    gopro.ts        # parseGoProName(), pairFiles() — LRV proxy ↔ GX/GH MP4
    fileAccept.ts   # isAcceptedVideo(), FILE_INPUT_ACCEPT (extension-only for Android)
    renderPlan.ts   # buildRenderPlan(): segments → cuts (cross-file split, clamping, replay cuts)
    replays.ts      # wantsReplay(): explicit override or isScoring()
    crop.ts         # replay zoom rect maths: aspect lock (h = w as fractions), clamp, zoom around centre, cropTransform()
    attack.ts       # attackingSide(), replayCropResolver(), replayOptionsFor(): which goal area a replay zooms to
    renderSources.ts # resolveRenderSources() (preview vs full), formatRenderProgress()
    fileBadges.ts   # pill badges (proxy, HEVC, can't play here)
  render/           # Rendering engine behind renderReel()
    mediabunnyEngine.ts # Packet remux → OPFS; slow-mo cuts stretch timestamps by 1/speed
    silentAudio.ts  # makeSilentAudio(): silent AAC frames via WebCodecs AudioEncoder (null if unavailable)
    fileSource.ts   # 8 MB aligned block reader for File input
```

**Data flow:** Files → `state.ts` → components read via Zustand selectors → utils receive plain data and return results (no store imports in utils).

### Keyboard shortcuts (Player)

One window-level `keydown` handler (`Player.tsx`) runs every player shortcut wherever focus is: body, video, buttons,
the match strip, the event log. `utils/shortcuts.ts` decides (`shortcutFor` = which action, `shouldHandleShortcut` = whether):
shortcuts never run in text inputs / textareas / selects / range inputs / contenteditable / menus / tabs, and not while the
event picker or a sheet / panel is open (those have their own keys). `components/playerShortcuts.ts` performs the actions.

| Key | Action |
|-----|--------|
| **Space** | Play / pause (also with a button focused: the key-up click is suppressed) |
| **G** | Add an event at the current playback time (opens the picker) |
| **M** | Mute |
| **, / .** | Decrease / increase playback speed (0.25x steps) |
| **/** | Reset playback speed to 1x |
| **Home / End** | Jump to kick-off (or start) / end of current file |
| **Left / Right** | Seek ±5 seconds (Shift: ±1 s) |
| **Up / Down** | Step one frame |
| **[ / ]** | Previous / next file |
| **Z / 0** | Cycle zoom / reset zoom |
| **F** | Toggle fullscreen |
| **Z / 0** | Cycle zoom 1 → 1.5 → 2 → 3 → 4 → 1 / reset zoom |

### Zoom and pan

- Zoomed in (> 1×), a plain left-button drag on the picture pans (grab / grabbing cursor); a click (< 5 px, < 300 ms) still toggles play, a drag never does.
- Mouse wheel with Ctrl (trackpad pinch) zooms 1×–4× towards the cursor; plain two-finger scroll pans while zoomed (page scroll untouched at 1×).
- Touch: pinch zooms, two-finger drag pans, double-tap seeks, tap toggles.
- Maths (`zoomTowards`, `dragPan`, `classifyPointer`, `wheelZoomFactor`, `clampPan`) lives in `src/utils/zoom.ts`; handlers in `Player.tsx`, state in `useZoomPan.ts`.
| **L** | Focus the event log |
| **Cmd/Ctrl+Z, +Shift** | Undo / redo (not in text fields) |

**Precedence:** a focused control that owns a key wins. In the event log (focused) Up/Down/Home/End select rows, Enter
watches, Delete removes, R toggles replay, E / T / N edit person / team / note, G adds an event; the log stops propagation
for those, everything else (Space, Left/Right, [ ] ...) falls through to the global handler. video.js sliders and buttons
keep their own arrow / Space handling (they stop propagation). In the picker's type step K / T / W place Kick off /
Half time / Final whistle (picker keys only; not global).

## Coding Practices

### DRY
- Extract any logic used in more than one place into `src/utils/`. Utils must be pure functions with no side effects.
- Shared UI patterns belong in a component, not repeated JSX.
- Do not duplicate type definitions — extend or compose from `src/types.ts`.

### TypeScript
- Prefer explicit return types on all exported functions.
- Avoid `any`. Use `unknown` + narrowing or proper generics.
- Keep types co-located with their domain; only promote to `types.ts` when shared across 2+ files.

### State
- All global state lives in `src/state.ts` (Zustand). Do not use `useState` for data that needs to cross component boundaries.
- Derive computed values (e.g. `timelineFiles`) inside selectors or `useMemo`, not in the store.

### Components
- One component per file. Named exports only (no default exports).
- Props interfaces are defined in the same file, above the component.
- Keep components presentation-focused; push business logic into utils or the store.

### Rendering (Mediabunny)
- Rendering lives behind `renderReel()` in `src/render/`. It remuxes encoded packets (no decode, no re-encode) from each cut into one MP4, streamed to OPFS so memory stays flat. Replay cuts (`speed < 1`, `silent`) re-emit the same video packets with timestamps/durations scaled by `1/speed` and fill their audio with silent AAC frames (or leave a gap when the browser has no AAC encoder).
- Cuts snap to keyframes (GoPro: 1.001 s GOP) and are clamped to the real end of each file. Audio is copied, so all clips in one render must share codec and audio parameters; mixed inputs are rejected with a message.
- GoPro `.LRV` proxies are paired with `GX`/`GH` MP4s by `src/utils/gopro.ts`; edit on proxies, render from `fullFile`.
- Read `File`s through `fileSource()` (`src/render/fileSource.ts`), never `BlobSource`: on Android every read from USB storage costs ~0.25 s, so it reads few, large (8 MB) aligned blocks.
- Replay zoom (sub-project K): `Cut.crop` (from `MatchEvent.replayCrop`, else the scoring team's attacking goal area from Match setup) makes the engine open the graphics session even without graphics; the replay's GOPs are decoded, the crop is drawn scaled to the full frame on a canvas (`imageSmoothingQuality 'high'`, GPU canvas + `rgbaToI420` in the footage's matrix/range), and re-encoded like an overlay (`cropOverlay.ts` makes the whole-cut overlay). A failed crop leaves the replay uncropped and is listed under "Rendered without". Preview applies the same rect through the player's CSS transform (`cropTransform`). Footage without colour tags (no VUI) gets a small hue shift in cropped replays (measured on synthetic untagged HEVC: pure red came back as 253,23,0; tagged BT.709 footage round-trips exactly), probably a matrix assumption mismatch between the browser's decode and our RGB-to-YUV; camera files are tagged.
- Show progress for renders; never block the UI silently.
- Do not unit-test engine internals; mock `../render` at the boundary.

## Testing (Red-Green TDD)

Tests use **Vitest** + **React Testing Library**.

### Workflow
1. **Red** — write a failing test that describes the desired behavior.
2. **Green** — write the minimal implementation to make it pass.
3. **Refactor** — clean up without breaking tests.

### What to test
- **Always test utils** — all functions in `src/utils/` must have unit tests. They are pure and easy to test.
- **Test state logic** — Zustand store actions and selectors via direct store calls, not through components.
- **Test components** for user-visible behavior (renders, interactions), not implementation details.
- **Do not test** the render engine internals directly — mock `../render` (`renderReel`) at the boundary.

### Environments
- Default test environment is `node` (set in `vite.config.ts`). Pure util tests run here.
- Component tests that need a DOM must add the docblock annotation: `// @vitest-environment happy-dom`

### File conventions
- Test files live alongside source: `src/utils/highlights.test.ts`, `src/components/GoalList.test.tsx`.
- Use `describe` blocks that mirror the function/component name.
- Prefer `it('should ...')` phrasing that reads as a specification.

### Example structure
```ts
// src/utils/highlights.test.ts
import { describe, it, expect } from 'vitest'
import { mergeOverlappingGoalSegments } from './highlights'

describe('mergeOverlappingGoalSegments', () => {
  it('should return empty array for no goals', () => {
    expect(mergeOverlappingGoalSegments([], 5, 10)).toEqual([])
  })

  it('should merge segments that overlap within padding', () => {
    // ...
  })
})
```

## Constraints & Gotchas

- **MP4 input required** — H.264 or HEVC video with AAC audio in MP4 containers (`.MP4` / GoPro `.LRV`). HEVC may not play in every browser; pair it with its LRV to edit.
- **HTTPS is required** (secure context for OPFS, and for testing from a phone). Dev server uses a self-signed cert (`localhost+2.pem`). New devs need to run `mkcert localhost 127.0.0.1 ::1` to generate their own certs.
- **No COOP/COEP headers** are needed any more (no SharedArrayBuffer).
- **File objects are not serializable** — `VideoSourceFile.file` (a `File`) cannot be stored in IndexedDB directly. Only goal metadata is persisted; files must be re-loaded on each session.
- Goal timestamps are stored as absolute `matchTimeSec` relative to the full multi-file timeline, computed via `computeCumulativeOffsets()`.
- **Cross-file segments** — when a goal's padding window spans two source files, `buildRenderPlan()` splits it into the previous file's tail and the current file's head; both are copied (no re-encode).

## Brand

All UI, copy and rendered video graphics follow `brand/shooot/BRAND.md` (skill: `shooot-brand`).
- Use the CSS variables in `brand/shooot/tokens.css` (`--sh-*`), never hard-coded hex values.
- Red (`--sh-rec`) is only for the REC dot (live/now/record); goals are lime.
- Lime is never text on light backgrounds (use `--sh-lime-text`).
- Player names and numbers use the shirt font (Big Shoulders); everything else is Archivo; clocks are JetBrains Mono.
- Keep the product name in one config constant and the logo in `brand/shooot/assets/`, so a rename is a one-line change.

### Brand in this app

- `src/index.css` imports `brand/shooot/tokens.css` + `motion.css` (Google Fonts `@import` removed from the pack; fonts are self-hosted) and maps them into Tailwind `@theme` (`bg-surface`, `text-muted`, `text-lime-text`, ...). `App.css` uses `var(--sh-*)` only; the picture well and overlays use `--sh-video` / `--sh-on-video` / `--sh-scrim`.
- Voices: `.voice-heading`, `.voice-scoreboard`, `.voice-shirt` (index.css); clocks and scores `.tc` (mono).
- Red only for REC meanings: playhead, the mark button's dot, render chip / dot. Warnings and destructive actions are chalk with an icon (`.msg-warn`, `.btn-danger`).
- Goals are lime ticks on the strip and scrubber; own goals chalk + "OG"; kit colours only as dots on rows and the score badge.
- Copy for empty / progress / success states lives in `utils/voice.ts`; check key colour pairs with `node scripts/check-contrast.mjs`.
