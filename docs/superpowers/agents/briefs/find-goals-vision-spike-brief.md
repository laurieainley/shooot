# Brief: vision-led Find goals spike (throwaway)

**Question:** without relying on audio, can a cheap on-device pass find the goals in a whole match? Stage 1 scans
the goal mouths for motion on a low-res proxy and proposes candidate windows. Stage 2 checks each window for the ball
at full quality (4K or source crops of each goal mouth, every frame). Measure recall, false alarms per match and CPU
time, at **both venues**, with **settings frozen before the test match**.

Read `docs/superpowers/agents/common-rules.md` first. Spike rules: code in `spikes/findgoals/` (git-ignored via
`spikes/`), no commits, no product code, never edit AGENTS.md/CLAUDE.md, CPU only (Intel i5, 4 cores, 16 GB, ~15 GB free
disk; keep temporary media under 3 GB at any time), no uploads of footage or frames anywhere, only the footage named
here (never search home/Downloads/camera folders), delete generated media > 5 MB except deliverables, long jobs in the
background with a log, no background processes left at the end. Another job may be encoding at the same time: run your
heavy work with `nice -n 5` and expect some contention.

## Start from

- `spikes/clipbench/README.md` (from "Full-match scan" on): the audio scan, its failure at the Autumn Cup (32/43
  missed, 19/43 after retraining), and the earlier ball checks (`ballscan.py`, `ball_at_goals.py`,
  `newvenue_ball.py`). Reuse code; don't rebuild.
- `spikes/tracking/REPORT.md`: stock RF-DETR nano (COCO "sports ball") on native 4K goal-mouth crops caught the ball
  every time in the goal mouth; the "fine-tuned" checkpoint is a 1-epoch smoke test, ignore it. Venv
  `spikes/tracking/.venv` has rfdetr, torch CPU, supervision, OpenCV.
- The product's goal set-up: each goal is marked as six points (post bottoms, bar ends, two back-of-net corners). Mark
  these yourself by looking at one frame per venue (and per file if the camera moved), as a user would.

## Footage and labels

- Tune on: `/Users/foundersfactory/Downloads/TNF full match 17-09-26.mp4` (4K, indoor hall). Goal labels:
  `spikes/clipbench/bundle/shooot-clip-test/clips.csv` (match 0917, label 1).
- Then freeze every threshold, write them to `spikes/findgoals/frozen.json`, and only then test on:
  - `/Users/foundersfactory/Downloads/TNF full match 24-09-26.mp4` and `.../TNF full match 29-09-26.mp4` (same hall),
    if labels exist for them in clips.csv; otherwise use them only for false alarms per hour and say so;
  - `/Users/foundersfactory/Downloads/TNF full match autumn cup.mp4` (1080p, outdoor rooftop cage with neighbouring
    pitches; labels `spikes/clipbench/labels/autumn_cup.txt`, goal = tag + 8 s; see also `autumn_cup_marks*.json`).
- Restart rule at both venues: no centre kick-off; after a goal play restarts with a kick from the conceding team's goal
  area. You may use it as a confirming feature (e.g. a lull, then the ball back at the conceding goal), not as the only
  signal.

## Work

1. **Stage 1, motion scan.** Decode a low-res proxy (e.g. 480p or 360p at 5–10 fps via ffmpeg, no full-size frames in
   memory) and score each second by motion inside each goal-mouth region (frame differencing or a light background model,
   normalised so a keeper walking about doesn't dominate; try the area behind the line / the net bulge separately from the
   area in front). Pick candidate windows (peak picking, merge nearby peaks). Report recall vs window count and choose a
   budget (e.g. top N per hour) that keeps recall high.
2. **Stage 2, dense ball check.** For each candidate window (e.g. −6 s … +3 s), decode source-resolution crops of that
   goal mouth at the full frame rate and run RF-DETR nano. Decide "ball went in" from the ball's path relative to the goal
   polygon and back-of-net points (inside the goal behind the line, or entering then stopping/dropping). Rank the windows.
3. **Score.** For each test match: goals found / missed, false alarms per hour after stage 2, timing error (seconds from
   label), and where the misses come from (stage 1 never proposed it vs stage 2 rejected it). Look at the frames of every
   miss and a sample of the false alarms, and say what they were.
4. **Speed.** CPU seconds per match hour for each stage; projected time on this Mac for a 60 min match. Note what would
   change in the browser (WebGPU / WASM RF-DETR in `src/detect/ballModel.ts`, TILE_SIZE 384, the decode worker).
5. **Audio as a bonus.** Optionally show whether adding the existing audio score helps at the hall but hurts or does
   nothing at the Autumn Cup. Keep it separate from the main result.

## Deliverables

- `spikes/findgoals/REPORT.md`: method, frozen settings, the results table per match (recall, false alarms/hour, timing
  error, CPU time), miss analysis with stills, and a verdict: is this worth building into Find goals, and what would the
  product version look like (stages, defaults, what the user marks).
- A few stills (a hit, a miss, a false alarm) and, if cheap, one ≤ 30 s 720p clip of a stage-2 detection (under ~5 MB),
  copied to `/Users/foundersfactory/Claude Files/shooot-findgoals/`.

Time box: about 2 hours. If running short, finish the hall test match and the Autumn Cup before anything else. Final
message: status, report path, deliverables, the results table.
