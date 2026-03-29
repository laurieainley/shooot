# SHOOOT UI Redesign — Design Spec

## Overview

Redesign the SHOOOT highlights editor from its current unstyled state into a bold, sporty, visually polished tool. This is a purely visual and layout restructuring — no changes to player logic, hotkey bindings, FFmpeg pipeline, or state management.

## Visual Identity: Stadium Pink

### Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `deep` | `#0d1b2a` | Page background, input fills |
| `surface` | `#1b263b` | Panel backgrounds, cards |
| `pink` | `#f72585` | Goal events, active states, secondary actions |
| `yellow` | `#ffd60a` | Brand (SHOOOT logo), primary CTA (Render) |
| `light` | `#f1faee` | Primary text |
| `muted` | `#6b7f96` | Secondary text, labels, hints |
| `border` | `#2b365b` | Input borders, panel dividers |

### Typography

- System font stack (`system-ui, -apple-system, sans-serif`)
- Bold weights (700/900) for headings and emphasis
- Section headers: uppercase, letter-spacing 1px, 12px, weight 700
- Body text: 11-13px range
- Tabular numerics for timestamps (`font-variant-numeric: tabular-nums`)

### Interactive Elements

- **Inputs:** Dark fill (`deep`) with subtle `border` stroke, `pink` focus ring
- **Pink buttons:** Goal/event actions (+ Goal, Preview, Play, Delete)
- **Yellow buttons:** Primary CTA only (Render MP4)
- **Ghost pink buttons:** Secondary actions (Preview Highlights — pink border, transparent fill)
- **Muted buttons:** Utility actions (Load Files, Import, Export — `surface` background, `muted` text)

## Layout

### Desktop (768px+)

```
┌──────────────────────────────────────────────────────┐
│  SHOOOT                        Load Files │ Import │ Export │
├──────────────────────────────────────────────────────┤
│  [first-half.mp4 45:00] [second-half.mp4 48:32] [+ Add file] │
├──────────────────────────────────────────────────────┤
│                                                      │
│                    VIDEO PLAYER                      │
│                   (full width)                       │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [23:41] [Team___] [Scorer__] [+ Goal]  Press G     │
├────────────────────────────┬─────────────────────────┤
│                            │  CLIP SETTINGS          │
│  GOALS                     │  Before: [10s] After: [4s] │
│  ┃ 23:41  V1 Arsenal Saka │  Match start: [00:00]   │
│  ┃ 56:12  V2 Chelsea Palmer│  ☐ Adjust by offset    │
│  ┃ 78:03  V2 Arsenal Havertz│─────────────────────────│
│                            │  OUTPUT                 │
│  + Bulk paste goals...     │  [Preview Highlights]   │
│                            │  [Render MP4]           │
│                            │  Arsenal 2 - 1 Chelsea  │
└────────────────────────────┴─────────────────────────┘
```

- Top bar: brand left, utility actions right
- File pills: horizontal row, active file has `pink` border, inactive has `border` stroke, dashed "+ Add file" pill at end
- Player: full-width, rounded corners, info overlays (file counter bottom-left, current time bottom-left in pink, speed bottom-right)
- Add Goal bar: directly under player in a `surface` container. Time input pre-filled from playback position, team input, scorer input, pink "+ Goal" button, keyboard hint right-aligned
- Panel grid: CSS grid `2fr 1fr`
  - Goals panel (left, spans 2 rows): goal rows with `pink` left-border, inline editable fields, play/delete actions, collapsible bulk paste at bottom
  - Clip Settings panel (top-right): before/after duration inputs, match start offset, adjust-by-offset checkbox
  - Output panel (bottom-right): ghost-pink Preview button, yellow Render button, score summary, progress/download when rendering

### Mobile (<768px)

- Top bar: brand left, single overflow menu button (...) right — contains Load Files, Import, Export, Clear
- File pills: horizontally scrollable row
- Player: full-width
- Add Goal bar: simplified — shows current time + "+ Goal" button only. Team/scorer entered via fullscreen modal (existing `FullscreenControls` modal) or by editing the goal row after creation
- Panels stack single-column: Goals list, then Preview/Render buttons, then score
- Clip Settings: collapsed by default, expandable via tap/toggle

## Component Changes

### Remove

- **`ChaptersExport`** — YouTube chapters (every 15s) section is redundant. Score display and goalscorers list are relocated to the Output panel.

### Merge / Restructure

| Current | New | Notes |
|---------|-----|-------|
| `FilePicker` + `FileList` | **FilePills** bar | Horizontal pills with duration, active state, reorder (drag or arrow keys), delete (x), "+ Add file" triggers hidden input |
| `AddGoalControls` + `AddGoalAtCurrentButton` | **AddGoalBar** | Single bar under player. Time pre-filled, team, scorer, + Goal button |
| `HighlightLengthControls` + match start offset + adjust-by-offset checkbox | **ClipSettings** panel | Unified settings panel. Match start offset and adjust-by-offset move here from ChaptersExport and RenderHighlights respectively |
| `ProjectIO` (Import/Export/Clear) | **Top bar** utility buttons | Move into the header. Clear All becomes a confirmation-gated action in the overflow/utility area |
| `BulkPaste` | Collapsible section inside Goals panel | Hidden by default, toggled via "+ Bulk paste goals..." link at bottom of goal list |

### Keep (Restyle Only)

- **`Player`** — same video.js setup, hotkey bindings, and all recent shortcut changes preserved. Only visual changes: overlay info styling to match palette, rounded corners
- **`GoalList`** — same data model, new row design: pink left-border, dark background, inline editable team/scorer fields, play and delete icons
- **`PreviewControls`** — moves into Output panel, same segment navigation logic
- **`RenderHighlights`** — Render button moves into Output panel, progress and download link shown inline below the button. The adjust-by-offset checkbox moves to Clip Settings
- **`FullscreenControls`** — same tap zones, speed controls, and goal modal. Restyled to match Stadium Pink palette (navy/pink/yellow instead of current purple)

### No New Components

This is a reorganization and restyle. No new features are being added.

## Styling: Tailwind CSS

### Setup

- Install `tailwindcss` + `@tailwindcss/vite` (Tailwind v4 Vite plugin)
- Add `@tailwindcss/vite` plugin to `vite.config.ts`
- `index.css` becomes the Tailwind entry point (`@import "tailwindcss"`)
- Extend theme with Stadium Pink palette tokens via CSS `@theme` block

### Theme Configuration

Tailwind v4 uses CSS-based configuration instead of `tailwind.config.js`:

```css
/* index.css */
@import "tailwindcss";

@theme {
  --color-deep: #0d1b2a;
  --color-surface: #1b263b;
  --color-pink: #f72585;
  --color-yellow: #ffd60a;
  --color-light: #f1faee;
  --color-muted: #6b7f96;
  --color-border: #2b365b;
}
```

This makes `bg-deep`, `text-pink`, `border-border`, etc. available as utility classes.

### Migration

- Remove all inline `style={{}}` objects from components
- Replace with Tailwind utility classes
- Gut `App.css` — retain only video.js overrides and fullscreen overlay styles that require specificity hacks or CSS features Tailwind doesn't cover (animations, `::cue`, z-index layering for fullscreen)
- `index.css` reduced to Tailwind `@import` + `@theme` block + any base resets needed for video.js

## Scope Boundaries

**In scope:**
- All visual and layout changes described above
- Tailwind CSS installation and configuration
- Removing ChaptersExport component
- Reorganizing existing components into new layout structure
- Responsive mobile layout

**Out of scope:**
- Player logic, hotkey bindings, keyboard shortcuts
- FFmpeg render pipeline
- Zustand state shape or persistence
- Adding new features (drag-and-drop reorder, undo, etc.)
- Testing changes (existing tests for utils remain untouched; component tests may need selector updates if any exist)
