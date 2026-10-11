# Ball check (B, Labs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With Labs on and goal marks set, Find goals runs a second phase that looks for the ball in the marked goals around
each audio suggestion (RF-DETR-nano via onnxruntime-web on WebGPU, WASM fallback, in a worker), tags suggestions with
"Ball in X's goal" and pre-selects Goal + the scoring team in the review.

**Architecture:** Pure helpers (`src/utils/ballSampling.ts`, `src/detect/ballModel.ts`) for sample times, tile geometry,
tensor pre/post-processing and the verdict; a worker (`src/detect/ballDetector.worker.ts`) owning the ORT session; a frame
source on Mediabunny `CanvasSink` reading through `fileSource`; an orchestrator (`src/detect/runBallCheck.ts`) with
injectable deps; `detectJobs` gains phase 2 after the audio suggestions are saved.

**Tech Stack:** onnxruntime-web ^1.30 (WebGPU + WASM, self-hosted assets), Mediabunny `CanvasSink`, OffscreenCanvas, Web Workers.

**Spec:** `docs/superpowers/specs/2026-10-11-ball-check-design.md` (+ rulings below)

## Rulings applied to the spec
- Persist: `labs` lands at **v20** (main is at v18, A at v19).
- No re-ranking (the audio shortlist is already fixed); B tags suggestions and pre-selects; the summary adds "Ball seen in N."
- C writes audio suggestions at the end of the audio run; phase 2 runs after that write, so cancelling/failing phase 2 never loses them.
- Model file `public/models/rfdetr-nano-fp16-v1.onnx` is stored in Git LFS (versioned name, so a new model gets a new name; served immutable); `VITE_BALL_MODEL_URL` overrides.

## Global Constraints
- AGENTS.md rules (pure utils + tests, explicit return types, no `any`, one component per file, erasableSyntaxOnly; no timers on
  the detection path — use `yieldToEventLoop`; read files only via `fileSource`).
- No third-party requests: ORT wasm/mjs assets are bundled/self-hosted by Vite (no CDN). Lazy-load ORT and the model only when phase 2 runs.
- Budget: 2 fps over [t − 3 s, t + 3 s] (13 frames) per suggestion; one 384×384 tile per marked goal per frame;
  near goal = its replay rectangle region scaled to 384; far goal = native-scale 384 tile centred on the goal mouth.
- Model recipe (exact, from `spikes/rfdetr-web/REPORT.md`): input `input` float32 [1,3,384,384], RGB/255 then ImageNet
  mean [0.485,0.456,0.406] / std [0.229,0.224,0.225], planar CHW; outputs `dets` [1,300,4] (cx,cy,w,h normalised to the
  tile) and `labels` [1,300,91] logits; score = sigmoid(labels[q][37]); keep ≥ 0.2; no NMS.
- Verdict: ball in a goal (`ballInGoal` from A) in ≥ 2 frames within [t − 1, t + 3] s, ignoring static detections
  (same position ±8 px in every sampled frame including t − 3).
- Copy (exact): progress "Checking the goal mouths… N%"; card hint "Ball in {team}'s goal" (use `teamGoalLabel` for the goal:
  "Ball in Colours' goal"); summary line "Ball seen in N." ; Labs menu item "Labs: on" (toggle to "Labs: off").
- Labs: `?labs=1` in the URL sets `labs: true` (persisted); `?labs=0` turns it off.

## Review Focus
1. No WebGPU and WASM fails/slow → phase 2 is skipped or fails without touching audio suggestions; a plain status line says why.
2. Goal marks for only one goal → only that goal is checked.
3. Multi-file timelines: sample times crossing a file boundary map to the right file and time.
4. Model fetch 404 (file not present) → phase 2 fails plainly ("Ball check unavailable: model not found."), audio results stay.
5. Cancel during phase 2 → stops promptly; worker terminated; suggestions keep any ball tags already written.

## Tasks
1. **Labs flag + types** — `labs` state (v20 migration), URL param handling in `main.tsx`/`App.tsx` init, ⋯ menu toggle (only shown once labs was enabled), `Suggestion.ball?: { goal: GoalTeam; frames: number }`, store `setSuggestionBall(id, ball)`. Tests.
2. **Pure sampling and verdict** — `src/utils/ballSampling.ts`: `sampleTimes(t, opts) → number[]` (13 values, clamped to [0, total]); `goalTiles(marks, frame) → { goal: GoalTeam; sx; sy; sw; sh; scale }[]` (near: replay rect from marks in px, square, clamped; far: 384 native centred on mouth midpoint, clamped); `tileToSource(box, tile)`; `ballVerdict(samples, marksByTeam, frame, t) → { goal; frames } | null` with the static filter; `scoringTeam(goal, teams, halfTimeSec, timeSec) → string | undefined` (team that attacks that goal — inverse of `replayGoalFor` for goals). Tests with the user's real mark fixtures from A and synthetic boxes.
3. **Model pre/post** — `src/detect/ballModel.ts`: `toTensorData(img: ImageData) → Float32Array` (exact recipe) and `decodeBalls(dets, labels, threshold) → {x1,y1,x2,y2,score}[]` in tile px. Tests: a 2×2 known image → expected normalised values; synthetic logits/dets → expected boxes and sigmoid scores.
4. **Worker + client** — add `onnxruntime-web` (^1.30.0); `src/detect/ballDetector.worker.ts` (init with model URL → `InferenceSession.create(buf, { executionProviders: ['webgpu','wasm'] })`, reports which EP; detect(ImageData[]) → boxes per tile; errors posted back); `src/detect/ballDetector.ts` client (`createBallDetector(): { ready: Promise<{ ep: string }>; detect(tiles): Promise<Box[][]>; dispose() }`, rejects on worker error, cancellable). ORT wasm assets: import their URLs with Vite `?url` and pass `ort.env.wasm.wasmPaths` as a filename→URL map (no CDN). Build must emit them; check `dist/assets`. Unit-test the client with a fake Worker; real ORT is verified in Task 7.
5. **Frame source** — `src/detect/frameSource.ts`: for one file, `CanvasSink` over `fileSource(fullFile ?? file)` video track; for given in-file timestamps and tiles, draw each tile region into a 384×384 OffscreenCanvas (`drawImage` with sx/sy/sw/sh), return `ImageData`; yield between frames; release canvases. Engine boundary: no unit test; covered by Task 7.
6. **Orchestrator + job phase 2 + UI** — `src/detect/runBallCheck.ts(suggestions, marks, files, offsets, deps, signal, onProgress)` → per-suggestion verdicts, writing each via `setSuggestionBall` as it completes (fake deps in tests: frames + detector); `detectJobs`: after audio `setSuggestions`, if `labs && goalMarks && files` → phase 2 with its own progress line; Cancel aborts both; failures set a plain `ballError` line and keep audio results. UI: `DetectProgress` shows the phase-2 line; `SuggestionCard` shows the hint and passes `preselectTeam = scoringTeam(...)` (from C's prop); summary adds "Ball seen in N." Tests for all UI copy and preselection.
7. **Verification** — gates; copy the spike's fp16 model to `public/models/` (git-ignored) and run the full Find goals with Labs on a 1080p test clip and on the original 4K match (from the user's GoPro card if mounted, read-only), in Chrome via Playwright: record EP used, per-tile ms, phase-2 time, and which suggestions got "Ball in …"; compare with the Python near-goal results (`spikes/yolo-test/goal/*`). Screenshots of the hint + preselection. Report verified / unverified (phones, Safari).
