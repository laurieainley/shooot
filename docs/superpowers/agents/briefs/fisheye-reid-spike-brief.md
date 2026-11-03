# Brief: fisheye correction + re-identification spike (throwaway)

**Questions:** (1) Once the GoPro Wide fisheye is corrected, does the 37 × 16 m pitch map fit, and how accurate are
positions, distances and speeds? (2) Does an appearance memory (re-identification) keep one identity per player across
gaps and crossings, so per-player stats become possible?

Read `docs/superpowers/agents/common-rules.md`, then `spikes/tracking/REPORT.md` and `spikes/tracking/STATS-REPORT.md`
(both earlier spikes; reuse their code, cached detections and venv `spikes/tracking/.venv`). Spike rules: code in
`spikes/tracking/`, no commits, no product code, never edit AGENTS.md/CLAUDE.md, CPU only, no uploads of footage or
frames, only the footage named here, delete generated media > 5 MB except deliverables, long jobs in the background with
a log, no background processes left at the end.

Footage: `/Users/foundersfactory/Downloads/TNF full match 17-09-26.mp4` (4K export of GoPro HERO12 Wide footage;
the file may have been re-encoded and possibly stabilised, so a published lens profile is a starting point, not truth).

## Facts from the user

- Pitch: **37 m × 16 m**. Goals are about 3.0 m wide (measured in the first spike). The user records in Wide and prefers
  to keep it (Linear loses the near corner).
- Main-session reading of the frame (check it, don't assume it): the basketball hoops are on the end walls and each goal
  sits under one, so the goals are on the 16 m ends; the wall across the top of the frame is the far 37 m side; the
  camera is high on the near long side towards the right end. The previous spike read it as corner-to-corner play:
  settle this by looking at frames (lines, hoops, goal positions, where players go).

## 1. Fisheye correction and pitch map

- Start from a public GoPro HERO12 Wide lens profile (the open Gyroflow lens-profiles database, organisation repo
  `gyroflow/lens_profiles`, pick the 4K 16:9 Wide profile closest to this footage), converted to OpenCV `fisheye`
  (Kannala-Brandt) coefficients.
- Refine with plumb-line calibration: the hall floor has many long straight painted lines and wall/floor junctions;
  fit distortion so they come out straight (report straightness residual before/after).
- Undistort, then a plain homography to the 37 × 16 m plane from the visible corners, wall lines and goal posts;
  checks: both goal widths (~3.0 m), player heights, line straightness. Report reprojection error and position error
  across the pitch (near/far, corners), and which areas are off-frame.
- Re-run the stats from cached detections: distances, top speeds (cap/outlier rule), minimap, heatmap. Look at the
  frames and say whether the minimap now matches what players are doing.

## 2. Re-identification (appearance memory)

- Embed player crops with a small re-id model (prefer OSNet via torchreid or a standalone OSNet x0.25/x1.0 checkpoint,
  MIT; alternative DINOv2-small/CLIP features). Sample crops at a modest rate to stay within CPU time.
- Keep a gallery per identity (several embeddings, updated over time); link tracklets by appearance + team + motion
  gating (no teleporting), Hungarian assignment; cap identities at the known head count (about 10–12 on the pitch).
- Simulate the product flow: "name each player once" on one clear frame (you pick a frame and assign roster-like names
  to the tracks), then let the gallery carry names for the rest of the window.
- Measure on the 2-minute window (and a second window if time allows): identities before/after (54 → ?), ID switches
  counted by eye on sampled stretches (crossings, bunching at the goal), how often a teammate in the same kit is
  confused, and per-player distance/top speed after merging.
- CPU cost per minute of footage for the embedding step.

## Deliverables

- Append "Fisheye correction" and "Re-identification" sections to `spikes/tracking/STATS-REPORT.md` (or a new
  `spikes/tracking/REID-REPORT.md`): numbers, what was checked by eye vs assumed, verdicts.
- A ≤ 60 s 720p overlay clip with stable names + the corrected minimap (under ~8 MB), an undistorted still with the
  37 × 16 m grid drawn on it, and the new heatmap; copy all to `/Users/foundersfactory/Claude Files/shooot-tracking/`.

Time box: about 90 minutes. Final message: status, report path, deliverables, and the key numbers (reprojection/position
error, identities before/after, ID switches, updated distance/speed).
