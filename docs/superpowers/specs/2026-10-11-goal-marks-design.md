# Goal marks — design (A)

Status: approved under the user's overnight instruction (2026-10-11: "finish C, A and B and test them"); decisions below
are rulings for the user to review in the morning.

## Why

Ball-in-goal detection (B) needs to know where each goal is in the picture: the goal line (between the post bases), the
crossbar, and — for a goal near the camera — the back of the net on the floor. Spikes showed that a plain rectangle
around the goal catches balls in front of / beside / above it; with these marks the near-goal test caught 8/8 goals with
one false alarm, and the far goal can be tested against the goal line. Today Match setup has only a replay-zoom rectangle
per team (`GoalAreas`).

## Decisions (rulings)

- **Marks live beside the existing rectangles**, per team, using the same convention as `GoalAreas`: `team1` / `team2` =
  the goal that team defends at kick-off (teams never swap in the user's games, but the Half time swap logic of
  `utils/attack.ts` still applies).
- **One marking step sets both:** when a goal's marks are complete, its replay-zoom rectangle is set from them (marks'
  bounding box with margin, at the frame's aspect, existing `clampRect` rules). The user can still drag the rectangle
  afterwards; re-marking resets it again.
- **Points:** post bases L and R (required), crossbar ends L and R (required), back-of-net floor corners L and R
  (optional — usually visible only for the near goal). "Left/right" as seen in the picture. Stored as fractions of the
  frame (0–1), like `CropRect`.
- **Persisted** in `vhm-state`, version **17 → 18**, migration `goalMarks: null`; included in project export/import and
  transfer links (small: ≤ 24 numbers).
- **No automatic goal finding** (Grounding DINO is too heavy for the browser; VLM pre-fill was ruled out by the user).
- **Pure geometry utils** for B: footprint polygon, near/far classification, "ball in goal" test, rectangle from marks.

## User flow

Match setup → **Goal areas** section gains, per team goal, a **Mark <team>'s goal** button (and **Edit <team>'s goal marks** / **Clear <team>'s goal marks** once set; e.g. "Mark Whites' goal").
Marking opens an editor on the same still frame Goal areas uses (`useFrameAt`, middle of the first video):
1. A prompt names the next point: "Click the bottom of the left post", "…right post", "Click the top of the left post",
   "…right post", then "Click the back-left corner of the net on the floor (optional)" with a **Skip** button, then back-right.
2. Placed points show as small dots (team tone), the goal line as a thicker line, posts and bar as thin lines, the floor
   footprint as a translucent polygon. Dots can be dragged (pointer) or nudged (arrow keys move the selected dot by 0.2%).
3. Zoom and pan with the existing `useZoomPan` (wheel/pinch zoom, drag with two fingers / right button / space+drag),
   because the far goal is ~200 px wide in a 4K frame.
4. **Done** (lime primary only when the 4 required points exist) saves the marks and sets the replay rectangle; **Cancel**
   leaves previous marks unchanged.
Touch: tap to place, drag to adjust; targets ≥ 44 px around dots; text ≥ 14 px.

## Geometry (pure, `src/utils/goalMarks.ts`)

```ts
type Pt = { x: number; y: number }                       // fractions of the frame
type GoalMarks = { postL: Pt; postR: Pt; barL: Pt; barR: Pt; backL?: Pt; backR?: Pt }
type GoalMarksByTeam = { team1?: GoalMarks; team2?: GoalMarks }
```
- `goalRectFromMarks(m, aspect): CropRect` — bounding box of all points, padded by 30% of the goal width each side
  (at least 0.04 of the frame), expanded to the frame's aspect, clamped (`clampRect`).
- `isNearGoal(m, frameH)`: post height (base→bar) ≥ 12% of the frame height **and** both back corners present.
- `footprint(m): Pt[] | null` — `[postL, postR, backR, backL]` when back corners exist.
- `ballInGoal(ball: { cx: number; bottom: number; w: number }, m, frame: { w: number; h: number }): boolean` (pixel
  space) —
  - near goal (`isNearGoal`): bottom point inside the footprint polygon shrunk by 8 px, and `w` ≥ 0.6 × the expected
    near-goal ball size (expected = 0.18 × post height in px);
  - otherwise (far / no back corners): `cx` within the posts (±3 px), `bottom` above the goal line at that x (smaller y,
    within 2 px tolerance) and below the bar line.

## Data and compatibility

- Store: `goalMarks: GoalMarksByTeam | null`, `setGoalMarks(team, marks | null)`; setting complete marks also calls
  `setGoalAreas` with the derived rectangle for that team (one undo-free settings change, like goal areas today).
- `newMatch` clears marks (like `goalAreas`); `clear` too.
- Project export JSON gains `goalMarks`; import reads it if present (normalised: drops malformed points, clamps to 0–1);
  transfer `KEYS` adds `goalMarks`.
- Swap ("Swap which goal is whose") swaps marks too.

## Testing

- Utils: rectangle from marks (aspect, padding, clamp); near/far classification; footprint; ballInGoal for near (inside,
  in front of the goal line, beside the post, too small) and far (behind line, in front of line, outside posts, above bar);
  normalisation of malformed input.
- Store: migration 17→18; setGoalMarks sets the rectangle; swap swaps marks; newMatch/clear reset; transfer payload
  includes marks; project import/export round-trip.
- Component (happy-dom): the prompt sequence, Skip for optional points, Done disabled until 4 points, Cancel keeps old marks,
  arrow-key nudge; editor renders lines/polygon (presence, not pixels).
- Screenshots at the five sizes, dark/light, with a real frame from a test clip.

## Out of scope

Automatic goal detection; per-file marks when the camera moves between files (future: marks per file); using marks for
anything other than replay zoom and B.
