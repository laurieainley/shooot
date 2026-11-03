# Brief: player stats spike (throwaway)

**Question:** from one fixed wide (fisheye) GoPro camera at a five-a-side pitch, which player stats can we produce
accurately enough to show people: shots on goal, passes, ground covered, top speed, tackles; and does a "post-goal
pattern" detect goals without audio?

Read `docs/superpowers/agents/common-rules.md` first. This is a spike: code lives in `spikes/tracking/` (git-ignored), no
commits, no product code, never edit AGENTS.md/CLAUDE.md. CPU only (Intel i5, 16 GB, ~17 GB free disk). No uploads of
footage or frames anywhere. Use only the footage named below; never search home/Downloads/camera folders for others.
Delete generated media > 5 MB when done (except the deliverables). Long jobs in the background with a log.

## Start from

- The replication spike in `spikes/tracking/` (read its `REPORT.md` first): player detection + ByteTrack, team colour
  assignment, ball detection with gap filling, possession state machine, passes, shots, goal-mouth crossing, overlay
  renderer. Reuse it; don't rebuild.
- Footage: `/Users/foundersfactory/Downloads/TNF full match 17-09-26.mp4` (4K, labelled goals in
  `spikes/clipbench/bundle/shooot-clip-test/clips.csv`, match 0917), then `/Users/foundersfactory/Downloads/TNF full
  match autumn cup.mp4` (1080p, other venue, labels `spikes/clipbench/labels/autumn_cup.txt`: goal = tag + 8 s).

## Lessons from the replication spike (apply them)

- 5 fps was too low: the near-goal shot and crossing happened in skipped frames. Use 10–15 fps on a shorter window
  (2–3 min) rather than 5 fps on a long one. CPU cost was ~0.33 s/frame for people and ~0.34 s/frame for the ball.
- The ball model that worked is stock RF-DETR nano (COCO "sports ball") on native 4K crops; the "fine-tuned" checkpoint
  is a 1-epoch smoke test, ignore it.
- Team colour "white vs not white" misclassified an Arsenal shirt and probably the keepers: cluster into two kits
  (+ keepers) per tracklet, seeded with the kit colours, voted over the tracklet.
- Tracks fragmented heavily (55 labels for ~12 people; "PASS X -> X"): tracklet merging is the first thing to fix.
- A 2D goal polygon at the far end can't tell ball-in-net from ball-in-air in front of the goal (8 fires for 1 goal):
  use the post-goal pattern and the back-of-net points instead.

## Restart rule (from the user)

In these games there is no centre kick-off after a goal: play restarts with a **kick from the goal area of the team that
conceded**, at both venues.

## Work

1. **Pitch coordinates.** Undistort the fisheye (estimate the lens model from straight pitch lines/boards, or a one-off
   manual calibration on a frame), then a homography to a pitch plane using the goal posts. Scale: five-a-side goals are
   3.66 m (12 ft) wide; check against any pitch markings. Report the estimated position error (e.g. reprojection of
   known lines, consistency of goal width at both ends).
2. **Identity over the match.** Measure ID switches / fragmentation on a 5–10 min window (count by eye on sampled
   stretches). Add offline tracklet merging (appearance + motion + team). Estimate how much manual work a "name each
   track from the roster" step would take (number of tracklets to label per 10 min after merging).
3. **Stats**, per player and per team, with honest confidence:
   - ground covered and top speed (smoothed pitch-plane positions, reject impossible jumps; top speed over ≥ 1 s);
   - passes (teammate → teammate possession change; observed vs inferred);
   - shots (kick toward the goal-mouth cone above pass speed; on target if it reaches the goal polygon or the keeper);
   - tackles (possession change between opponents while their boxes/feet are in contact; separate from interceptions);
   - goals via the post-goal pattern: ball in the goal, a lull in player speed, the scoring team retreating, then a
     restart kick from the conceding team's goal area. Also try a small classifier on per-second features (team
     centroids, mean speed, ball position) trained on one match and tested on the other; hard negatives = saves, ball
     out, fouls (from the labels where present).
4. **Validation:** for passes, shots and tackles, sample ~20 detected events each plus 2–3 one-minute stretches, watch
   the frames, count true/false/missed. Distances and speeds: compare with typical five-a-side figures and say it's a
   sanity check, not ground truth. Goals: recall/false alarms vs labels, timing error.
5. **Speed:** CPU time per stage per minute of footage at the frame rate used; extrapolate to a full match.

6. **Minimap** (the user is keen on this): a small top-down pitch drawn to scale with every player's position (team
   colour, label) and the ball, updated live, plus a per-player heatmap and average-position chart. In the product the
   user would mark the pitch outline themselves (like goal set-up), so assume four pitch corners + goal posts marked by
   hand on one frame (you mark them by looking at a frame). Report which parts of the pitch the camera can't see or
   where position error gets large (far corners under fisheye).

## Deliverables

- `spikes/tracking/STATS-REPORT.md`: method, numbers, a table of each stat with a verdict (show / show with caveat /
  not reliable), what was verified by eye vs assumed, what a GPU would change.
- A ≤ 60 s 720p overlay clip with pitch-plane minimap and live stats (under ~8 MB) plus stills, also copied to
  `/Users/foundersfactory/Claude Files/shooot-tracking/`.
- Stats JSON for the processed window(s).

Time box: about 60 minutes; shrink the window rather than overrun. Final message: status, report path, deliverables,
the verdict table.
