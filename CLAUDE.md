# CLAUDE.md — Shot Stopper

## Project Overview

Shot Stopper (branded "SHOOOT") is a browser-based video highlight editor. Users load one or more MP4 files, scrub through the footage, mark events (goals, key moments) at specific timestamps — either manually or via keyboard shortcuts — and render a concatenated highlight reel. The render uses FFmpeg WASM to extract and join segments without fully re-encoding the video (`-c:v copy`), keeping output fast and lossless relative to the source.

The tool is designed around football/soccer match footage (the primary use case is marking goals), but the workflow is deliberately generic — any MP4 content with discrete moments worth clipping works the same way.

### Core workflow

1. **Load MP4s** — drag/drop or file picker; multiple files form a single ordered timeline.
2. **Mark events** — press **G** while playing to add a goal at the current playback position, or enter timestamps manually. Each event records the time, source file, and optional team/scorer metadata.
3. **Configure clip padding** — set how many seconds before and after each event to include (defaults: 10s before, 4s after). Overlapping segments are automatically merged.
4. **Preview** — step through the generated segments in-player before committing to a render.
5. **Render** — FFmpeg extracts each segment via stream-copy, concatenates them into a single MP4, and offers a download. Audio is re-encoded to AAC to ensure cross-segment compatibility.
6. **Export chapters** — generate YouTube-format chapter markers from the goal list.

## Tech Stack

- **React 19 + TypeScript** — strict mode enabled
- **Vite 7** — dev server runs on `https://localhost:5174` (HTTPS required for SharedArrayBuffer / FFmpeg multithreading)
- **Zustand 5** — global state (`src/state.ts`)
- **FFmpeg WASM** (`@ffmpeg/ffmpeg`) — in-browser segment extraction and concatenation (stream-copy, no full re-encode)
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
  state.ts          # Zustand store — single source of truth
  App.tsx           # Root layout
  components/       # One component per file, named exports
    Player.tsx      # Video.js player with hotkeys (G = mark event, <> = speed, etc.)
    EventPicker.tsx           # G → type → team → scorer picker (popover / mobile sheet)
    MatchSetup.tsx            # Teams, colours, rosters, match start
    TimelineMarkers.tsx       # Event / match-start markers portalled into the scrubber
    ChaptersCopy.tsx          # Copy YouTube / highlight chapters
    TimeInput.tsx             # Shared mm:ss time field
    fullscreen.ts             # Redirects video.js fullscreen to the player container
    GoalList.tsx    # Editable list of marked events
    AddGoalControls.tsx       # Manual goal entry (time, team, scorer)
    AddGoalAtCurrentButton.tsx # One-click goal at current playback position
    RenderHighlights.tsx      # FFmpeg render pipeline — segment extraction + concat
    ChaptersExport.tsx        # YouTube chapter text generation
    HighlightLengthControls.tsx # Before/after padding config
    PreviewControls.tsx       # Step through highlight segments in-player
    FilePicker.tsx            # MP4 file loading
    FileList.tsx              # Loaded file list with metadata
    FullscreenControls.tsx    # Overlay controls for fullscreen playback
    BulkPaste.tsx             # Paste multiple goals at once
    ProjectIO.tsx             # Import/export project state as JSON
  utils/            # Pure functions only — no React, no side effects
    highlights.ts   # mergeOverlappingGoalSegments()
    timeline.ts     # computeCumulativeOffsets(), formatHMS()
    chapters.ts     # generateYouTubeChapters(), generateHighlightChapters()
    eventTypes.ts   # Event type metadata, picker options, isScoring(), migrateEvent()
    eventPicker.ts  # Pure picker reducer (type → team → scorer)
    roster.ts       # parseRoster(), filterRoster(), teamShortcuts()
    markers.ts      # markersForFile(), startInFile(), homeTarget()
    probe.ts        # video metadata extraction
```

**Data flow:** Files → `state.ts` → components read via Zustand selectors → utils receive plain data and return results (no store imports in utils).

### Keyboard shortcuts (Player)

| Key | Action |
|-----|--------|
| **G** | Mark event (opens picker: ⏎/G goal, P pen, O own goal, A pen awarded, X pen missed, H highlight, F foul, S save) |
| **M** | Mute / unmute |
| **, / .** | Decrease / increase playback speed (0.25x steps) |
| **/** | Reset playback speed to 1x |
| **Home** | Jump to match start (press again for 0:00) |
| **End** | Jump to end of current file |
| **Left / Right** | Seek ±5 seconds |
| **Shift + Left / Right** | Seek ±1 second |
| **Up / Down** | Step one frame forward / back (pauses) |
| **[ / ]** | Previous / next file |
| **F** | Toggle fullscreen (the whole player container, so overlays and the picker stay visible) |

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

### FFmpeg WASM
- The render pipeline extracts segments via stream-copy (`-c:v copy`) and concatenates them using the MPEG-TS concat method. Video is never re-encoded; audio is re-encoded to AAC for cross-segment compatibility.
- FFmpeg operations are expensive and blocking. Always run them behind a loading gate with progress feedback; never block the UI thread silently.
- Never import `@ffmpeg/core` or `@ffmpeg/core-mt` directly — they are externalized and loaded at runtime from `/public/ffmpeg/`.
- Large files (>2 GB) use WORKERFS mounting instead of `writeFile` to avoid memory limits.

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
- **Do not test** FFmpeg encoding pipelines directly — mock the FFmpeg API at the boundary.

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

- **MP4 input required** — stream-copy rendering relies on H.264/AAC in MP4 containers. Other formats will fail or produce broken output.
- **HTTPS is required** for SharedArrayBuffer (used by FFmpeg multithreading). Dev server uses a self-signed cert (`localhost+2.pem`). New devs need to run `mkcert localhost 127.0.0.1 ::1` to generate their own certs.
- **COOP/COEP headers** must be set both in Vite dev config and in `vercel.json` for FFmpeg WASM to work in production.
- **File objects are not serializable** — `VideoSourceFile.file` (a `File`) cannot be stored in IndexedDB directly. Only goal metadata is persisted; files must be re-loaded on each session.
- Goal timestamps are stored as absolute `matchTimeSec` relative to the full multi-file timeline, computed via `computeCumulativeOffsets()`.
- **Cross-file segments** — when a goal's padding window spans two source files, the render pipeline pulls from both files and joins them. Audio is re-encoded in these cases to maintain sync.
