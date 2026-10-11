# Goal detection — roadmap to "testable end to end" (overnight, 2026-10-11)

User instruction (2026-10-11, before sleeping): finish C, A and B and test them, wire in whatever else is needed so that
(a) goal-detection efficacy can be tested on more QMSC matches and different pitches (e.g. outdoor 4G), and
(b) the whole workflow runs inside Shooot. Work within usage limits; when a limit hits, resume from this file + the SDD ledgers.

Resume rule: read this file, then `.superpowers/sdd/*/progress.md` in `.claude/worktrees/suggested-goals`, then `git log`.
Never push or deploy without the user's go-ahead (merging to local `main` is fine; pushing `main` deploys publicly).

## Track 1 — C: Find goals (Beta), audio  ·  branch `feat/suggested-goals`
- [x] Tasks 1–3 (features, score, store v17) — reviewed
- [ ] Tasks 4–7 (decode/worker/job, review UI, strip rings, verification) — SDD, Sonnet implementers + reviewers
- [ ] Final whole-branch review (Opus), fixes, merge `--no-ff` to local `main` (not pushed)

## Track 2 — Evaluation harness (spikes/, git-ignored) for (a)
- [ ] RF-DETR-nano near-goal re-scan on alo, 17-09, QMSC 14-10, TNF 02-07 (running: `spikes/yolo-test/goal/run_rf4.sh`)
- [ ] Re-score near goal with frozen rules (size threshold re-derived for RF-DETR on alo only, then frozen); report per match
- [ ] Far goal: time-based rules (ball stops inside the mouth ≥ 1 s, then vanishes; net-motion inside the mouth); tune on alo + 17-09, blind test on others
- [ ] Combined score (audio + near + far) → one ranked list per match; recall in 1×/2× shortlist; blind on untouched matches
- [ ] One command per new match: `spikes/goal-detect/eval_match.py <video> <goals.txt> <marks.json>` (audio + RF-DETR near/far + combined + report);
      goal marks via the existing marking tool (or, once A ships, from the app's project export)
- [ ] Findings note: `docs/superpowers/notes/2026-10-11-goal-detection-findings.md`

## Track 3 — A: goal marking in Match setup  ·  branch `feat/goal-marks`
- [ ] Spec (decisions recorded as rulings under the user's instruction) → plan → SDD
- Shape: per team goal (`team1`/`team2`, the goal that team defends at kick-off): posts base L/R, bar L/R, back corners L/R (optional);
  replay zoom box derived from the points (existing rect kept as fallback); persisted v18 with migration (old rect → no points);
  marking UI reuses `FrameBoxes`-style still frame with point placement + zoom; project export/transfer include the points.

## Track 4 — B: ball detection in the browser  ·  branch `feat/ball-detect`
- [ ] Spike first: export RF-DETR-nano (Apache-2.0) to ONNX; run in Chrome with onnxruntime-web (WebGPU, WASM fallback) on saved
      near-goal crops; check accuracy matches Python and time per crop; check model size / hosting
- [ ] If the spike passes: spec → plan → SDD. Shape: after the audio pass, decode ±(3…10) s around each suggestion with Mediabunny,
      crop near/far goal regions from A's marks, run the detector in a worker, apply ball-in-goal rules, add `source: 'ball'`
      suggestions and boost audio ones it confirms. Off by default behind a Labs flag (`?labs=1`) until validated (ruling).
- [ ] If WebGPU fails: document, fall back to WASM timing, and decide with the user.

## Track 5 — End-to-end test inside Shooot for (b)
- [ ] Local dev server + Playwright on the user's provided match files (paths the user gave): load files, mark goals, Find goals,
      review, check kept events and reel; screenshots at the standard sizes; timings per match. Report verified / unverified.

## Order and budget
1. C tasks 4–7 → merge locally.  2. Track 2 scoring while scans run.  3. B spike (decides B's feasibility early).
4. A spec/plan/build.  5. B spec/plan/build.  6. Track 5.  Sonnet for implementation/review, Opus only for final reviews.
