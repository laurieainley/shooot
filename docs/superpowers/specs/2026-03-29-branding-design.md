# SHOOOT Branding — Logo, Favicon & Empty States

## Overview

Add brand identity to SHOOOT: a bold geometric SVG wordmark, matching favicon, and instructional empty states for the two key "nothing here yet" moments. Uses the Stadium Pink palette from the UI redesign spec. Standalone work — no dependency on the redesign's layout or component restructuring.

## 1. Logo / Wordmark

**`src/components/Logo.tsx`** — inline SVG component.

- **Style:** Bold, geometric, uppercase. Heavy stroked letterforms rendered as SVG paths (no external font dependency).
- **The three O's:** Plain bold circles — no icons, no textures. Slightly larger optical weight than S/H/T for presence.
- **Colour:** Yellow (`#ffd60a`) by default. Accepts an optional `className` prop for overrides.
- **Size:** Accepts a `height` prop (default 32px). Scales proportionally via `viewBox`.
- **Usage:** Replaces the current `<h1>SHOOOT - Highlights creator</h1>` in `App.tsx`. Subtitle "Highlights creator" rendered alongside in `muted` colour at smaller size, or omitted on mobile.

## 2. Favicon

**`public/favicon.svg`** — the three O's from the wordmark, yellow on deep navy (`#0d1b2a`) background, sized for 32x32.

- `index.html` updated to reference `favicon.svg` instead of `goal.png`.
- `goal.png` left in place (not deleted) to avoid breaking anything that might reference it.

## 3. Empty States

### A) No files loaded — landing state

**`src/components/EmptyPlayer.tsx`** — shown in the main content area when `files.length === 0`.

- Centered layout within the player container area
- SHOOOT logo rendered prominently (larger than header size)
- Below: "Drop MP4 files here or click Load Files to get started" in `muted` text
- Below that: compact keyboard shortcuts reference (G/M = mark goal, , . = speed, / = reset, [ ] = switch file)
- Dashed border container (`border-dashed border-border`) to signal drop zone affordance
- Background: `surface` colour

### B) No goals yet

Modify **`src/components/GoalList.tsx`** — when goals array is empty, show:

- "No goals marked yet. Press G or M during playback to mark a goal."
- `muted` text, centered, no heavy visual treatment

## 4. File Changes

| File | Change |
|------|--------|
| `src/components/Logo.tsx` | **New** — SVG wordmark component |
| `public/favicon.svg` | **New** — three-O's favicon |
| `src/components/EmptyPlayer.tsx` | **New** — landing empty state |
| `src/App.tsx` | Replace h1 with Logo + subtitle; conditionally render EmptyPlayer vs Player |
| `src/components/GoalList.tsx` | Add empty state message when no goals |
| `index.html` | Update favicon href |

## 5. Palette Reference (from UI redesign spec)

| Token | Hex | CSS class |
|-------|-----|-----------|
| `deep` | `#0d1b2a` | `bg-deep`, `text-deep` |
| `surface` | `#1b263b` | `bg-surface` |
| `pink` | `#f72585` | `text-pink` |
| `yellow` | `#ffd60a` | `text-yellow` |
| `light` | `#f1faee` | `text-light` |
| `muted` | `#6b7f96` | `text-muted` |
| `border` | `#2b365b` | `border-border` |

Tailwind theme tokens assumed to be configured (per the redesign work already underway).

## 6. Scope Boundaries

**In scope:** Logo component, favicon, two empty states, App.tsx header swap, GoalList empty message.

**Out of scope:** Layout changes, component restructuring, player logic, state changes, the broader redesign work.
