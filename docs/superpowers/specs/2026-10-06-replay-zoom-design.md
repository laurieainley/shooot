# Replay Zoom to Goal Areas — Design (Sub-project K)

**Date:** 2026-10-06
**Source:** user: "set a position of the goals to allow highlights to zoom there for the replays … select where the goals are based on a frame in the middle of the first clip … replay could be a crop to this zone by default … when selecting a goal with a replay active, this could be overwritten … set position and zoom level for both."
**Order:** after I and J.

## Setup: mark the two goals

- Match setup → **Goal areas**: shows a still frame from the middle of the first file (avoids the start, when the camera is often still being adjusted). The user drags a box over each goal mouth (left goal, right goal); the box aspect is locked to 16:9 so the crop fills the frame. Default box size = 40 % of frame width.
- Stored per project as normalised rectangles `{ x, y, w, h }` (0–1) for `left` and `right`; also a "Same camera position throughout" assumption (one set per match; per-file override later if needed).
- Touch: drag to move, pinch or corner handle to resize (≥ 44 px handles); desktop: drag + handles.

## Replays use the zoom by default

- Each replayed event picks the goal area it belongs to: by default the side nearest to where the replay window's action is — v1 rule: the **team's attacking goal**, from a per-half "Whites attack left/right" toggle in Match setup (swap at half time when a Half time/Kick off 2nd half marker exists); fallback: the user's choice in the editor.
- The edit sheet (when Replay is on) gets **Replay framing**: Left goal / Right goal / Full frame / Custom (drag box on the event's frame), plus a zoom slider (1×–3×) that scales the box around its centre. Stored on the event as `replayCrop?: { x, y, w, h } | 'left' | 'right' | 'full'`.

## Rendering

- Cropped replays cannot be stream-copied: the replay's GOPs go through the graphics session (decode → crop & scale to full frame on a canvas → encode), like overlays. The slowed timestamps, replay audio at 50 % and the REPLAY tag apply as now. Footage outside replays stays stream-copied.
- Scaling quality: canvas `imageSmoothingQuality = 'high'`; warn in the editor when the crop is smaller than ~35 % of frame width on 1080p footage (visibly soft).
- Preview in the app: during Preview, replays are shown with the same crop via the CSS zoom/pan transform already used for player zoom (so what you see matches the render).

## Testing

- Unit: crop rect maths (aspect lock, clamp to frame, zoom around centre, normalised ↔ pixels), side selection rule, persistence/migration.
- Component: Match setup goal-area editor (drag/resize via pointer events), edit-sheet replay framing controls.
- Render: generated test footage with distinct left/right markers; replay frames show the expected region (sample pixel colours at known positions); ffmpeg/AVFoundation decode clean; timing measured.
