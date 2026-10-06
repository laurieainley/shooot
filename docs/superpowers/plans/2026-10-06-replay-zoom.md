# Replay zoom to goal areas — Implementation plan (sub-project K)

Spec: `docs/superpowers/specs/2026-10-06-replay-zoom-design.md`. Red-green TDD throughout.

## Model

- `CropRect = { x, y, w, h }` normalised 0-1. Because the box has the frame's aspect, `h === w` (16:9 lock). Zoom = 1 / w.
- Store: `goalAreas: { left, right } | null`, `whitesAttackLeft: boolean` (first half; the second half swaps when a second Kick off marker exists), persisted (v11, additive) and in project JSON.
- `MatchEvent.replayCrop?: CropRect | 'left' | 'right' | 'full'` (undefined = default: the scoring team's attacking goal, or full frame without goal areas / team).
- `Cut.crop?` / `Cut.cropLabel?`; `PreviewStep.crop?`.

## Tasks

1. **utils/crop.ts** (+ test): `clampRect` (aspect lock h = w, min width, inside frame), `moveRect`, `resizeRect`, `zoomRect` (around centre), `zoomOf`, `defaultGoalAreas`, `isSoft` (< 35 %), `cropPixels`, `cropTransform` (CSS zoom + pan for a viewport), `normaliseAreas` (persistence/migration).
2. **utils/attack.ts** (+ test): half of an event (second Kick off), `attackingSide(event, teams, whitesAttackLeft, kickOffs)`, `resolveReplayCrop(event, ctx)` handling `'left' | 'right' | 'full' | rect | undefined`.
3. **renderPlan / preview / reel / exportPlans**: `ReplayOptions.cropFor`, `Cut.crop`, `PreviewStep.crop` (tests: replay cuts carry the crop, clips never do, nothing when `cropFor` absent or full frame -> no crop).
4. **state.ts**: `goalAreas`, `whitesAttackLeft`, setters, persistence, `startPreview` passes the resolver; `exportPlans` too. ProjectIO import/export.
5. **Engine** (`types.ts`, `graphicsSession.ts`, `mediabunnyEngine.ts`): crop as a whole-cut overlay with `crop`, painted by drawing the decoded frame cropped + scaled with `imageSmoothingQuality = 'high'` through the existing canvas path (rect maths in `render/cropRegion.ts`, tested); falls back to uncropped replay and reports "Replay zoom" under "Rendered without"; a render with crops always opens the graphics session.
6. **UI**: `FrameBoxes` (drag / corner-handle / pinch box editor, pointer events, >= 44 px targets), `GoalAreasSetup` in Match setup (frame grab from the middle of file 1, whites attack toggle), `ReplayFraming` in the edit sheet (Auto / Left / Right / Full / Custom + zoom slider + soft warning), Preview uses the same crop through the player's CSS transform.
7. **Verification**: generated footage (HEVC + LRV), headless Chrome render, pixel + frame checks, bit-identical outside replays, timings, screenshots at 4 sizes.
8. Docs: CLAUDE.md section.
