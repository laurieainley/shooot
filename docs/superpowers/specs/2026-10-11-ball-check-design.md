# Ball check — design (B, Labs)

Status: approved under the user's overnight instruction (2026-10-11); decisions are rulings for the user to review.
Depends on C (suggested goals) and A (goal marks).

## Why

Audio alone puts ~70–75% of goals into a 2× shortlist but can't say *which* moments are goals or *which* team scored.
A ball seen inside a marked goal right after the shout is strong evidence, and the goal it's in tells us the team
(the team that attacks that goal). Spikes: near-goal ball-in-goal caught 8/8 near-end goals on the tuned match; the far
goal is weak (8/12 with many false alarms) and only boosts. Detector: **RF-DETR-nano (Apache-2.0)**, stock COCO weights,
"sports ball" class — it beat YOLO11/26 on 70 labelled frames (27/28, 18/20, 17/19). Browser spike
(`spikes/rfdetr-web/REPORT.md`): ONNX runs in Chrome via onnxruntime-web on WebGPU with Python-identical detections;
~0.7 s per 384×384 tile on a 2020 Intel iGPU (much faster expected on Apple Silicon); fp16 model 62 MB.

## Decisions (rulings)

- **Labs only:** the ball check runs only when Labs is on (`?labs=1` sets a persisted `labs: true`; ⋯ menu shows
  "Labs: on" with a toggle once set). Public users keep audio-only Find goals until it's validated on more matches.
- **Model hosting:** loaded from `VITE_BALL_MODEL_URL` (default `/models/rfdetr-nano-fp16-v1.onnx`). The 62 MB file is
  stored in Git LFS in `public/models/` and served by Vercel static with an immutable cache header; the versioned filename
  means a new model gets a new name.
- **Runtime:** `onnxruntime-web` (WebGPU, WASM fallback), self-hosted wasm/assets (no third-party requests), inside a Web
  Worker; one session per run; model cached by the browser's HTTP cache (Cache Storage optional later).
- **Budget per suggestion:** frames at **2 fps** over **[t − 3 s, t + 3 s]** of the full-quality file (13 frames); per frame
  **one 384×384 tile per marked goal**:
  - near goal: the goal's replay rectangle region resized to 384 (ball stays ~20–45 px);
  - far goal: a native-scale 384×384 tile centred on the goal mouth (ball ~14 px at 4K; at 1080p it's ~7 px and will rarely
    be found — documented limitation).
  ⇒ ~26 inferences per suggestion; 30 suggestions ≈ 780 tiles ≈ 9 min on the Intel test Mac, ~1–2 min expected on Apple Silicon.
- **Decision rule per suggestion:** a goal is "ball in goal" when the ball is in that goal (`ballInGoal` from A) in ≥ 2 sampled
  frames within [t − 1, t + 3] s, and those detections are not static (same position ±8 px in every frame of the window and
  in the first frame at t − 3 → treat as a resting spare ball and ignore).
- **Effects:** the suggestion gets `ball: { goal: GoalTeam; frames: number }`; its sort key gets +3 (near) / +1.5 (far);
  the review card shows "Ball in Colours' goal" and pre-selects **Goal** for the team that attacks that goal (Enter or G
  then the pre-selected team key confirms; the user can still choose otherwise). No new suggestions are created from the
  ball alone (would need a full-match scan; out of scope).
- **When it runs:** as a second phase of Find goals ("Checking the goal mouths… N%"), only when Labs is on, goal marks exist
  for at least one goal, and the browser has WebGPU or WASM. Cancel stops both phases; audio suggestions stay if phase 2 is
  cancelled or fails ("Rendered without" spirit: failure never costs the audio result).

## Components

- `src/utils/ballSampling.ts` (pure): sample times per suggestion; tile rectangles per goal from marks and frame size;
  decision rule (`ballVerdict(detsByFrame, marks, frame)`), static filter, score boost.
- `src/detect/ballDetector.worker.ts` + `src/detect/ballDetector.ts`: ORT session (WebGPU → WASM), preprocessing recipe
  (RGB/255, ImageNet mean/std, CHW float32 384×384), postprocessing (`dets` cx,cy,w,h normalised; sigmoid of `labels[37]`;
  threshold 0.2; boxes back to source pixels).
- `src/detect/frameSource.ts`: Mediabunny `CanvasSink`/`VideoSampleSink` at given timestamps from `fileSource(fullFile ?? file)`,
  draws the tile region into an `OffscreenCanvas` and returns `ImageData` (transferred to the worker).
- `src/detect/runBallCheck.ts` (injectable deps, tested with fakes): loops suggestions → frames → tiles → detector → verdicts.
- Job: extend `detectJobs` with phase 2 (progress split 0–50% audio, 50–100% ball when enabled).
- Store: `labs: boolean` (persisted, v19), `setLabs`; `Suggestion.ball?` (persisted with suggestions).
- UI: progress copy, card hint + pre-selection, Labs toggle in ⋯ when enabled.

## Testing

Pure utils (sampling, tiles, verdict, static filter, boost) with fixtures from the spike; runner with fake decoder/detector;
UI tests for hint and pre-selection; a dev harness check: run phase 2 in Chrome on the original match's suggestions and compare
verdicts with the Python near-goal results (≥ the same goals found); timings recorded per machine. Real devices: unverified
until the user tries (iPad Safari WebGPU support varies).

## Out of scope

Ball-only suggestions (full-match scan), fine-tuned weights, per-user training, far-goal net-motion cue (future), Safari tuning.
