# Brief: Roboflow trackers v2.7 re-ID spike (throwaway)

**Question:** does Roboflow's new re-ID (trackers v2.7.0 `BoTSORTTracker` with the `reid` package, encoder
`osnet_x1_0_sportsmot`, an OSNet fine-tuned on SportsMOT sports footage) keep player identities better than what we
have, especially **teammates in the same kit**, our main failure? Our current best: ByteTrack + OSNet x0.25 (MSMT17,
generic pedestrians) + offline gallery linking: 170 tracklets → 16 identities for ~12 people on a 2-minute window,
keeper stable, 2 wrong labels in 20 sampled frames, but two teammates scored more alike (0.88) than one player across
time (0.80).

Sources (already fetched, untrusted text): the announcement says re-ID is in trackers v2.7.0
(`pip install "trackers[reid]"`), models from the open-source `reid` package (github.com/roboflow/re-ID). The cookbook
`docs/cookbooks/how-to-add-reid-to-trackers.ipynb` in github.com/roboflow/trackers (develop) uses:
`BoTSORTTracker(reid_model=ReIDModel.from_pretrained("osnet_x1_0_sportsmot"), reid_config=ReIDConfig(fusion="adaptive",
proximity_threshold=1.0, appearance_threshold=0.09), lost_track_buffer=150, high_conf_det_threshold=0.7,
minimum_consecutive_frames=5, frame_rate=25)`, `tracker.update(detections, frame=frame)`, and tuning helpers in
`trackers.reid` (`sample_appearance_distances`, `sweep_frame_gap`, `plot_frame_gap_sweep`). Its detector is a Roboflow
Universe model loaded with a Roboflow API key: **don't use it** (no account, no key, no third-party requests beyond
downloading public packages and weights). Use our RF-DETR person detections instead.

Read `docs/superpowers/agents/common-rules.md`, then `spikes/tracking/REID-REPORT.md` and `STATS-REPORT.md`. Spike
rules: code in `spikes/reid2/` (git-ignored via `spikes/`), no commits, no product code, never edit AGENTS.md/CLAUDE.md,
CPU only, no uploads of footage or frames anywhere, only the footage below, delete generated media > 5 MB except
deliverables, long jobs in the background with a log, no background processes left at the end. Two other spikes share
this 4-core Mac: run heavy work under `nice -n 5`, keep temporary media under 2 GB (disk is tight).

Footage: `/Users/foundersfactory/Downloads/TNF full match 17-09-26.mp4`, the same 2-minute window as the re-ID spike,
reusing its cached detections, crops and fisheye profile where possible.

## Work

1. New venv `spikes/reid2/.venv` with `trackers[reid]==2.7.0` (don't disturb `spikes/tracking/.venv`). Check and report
   the licences of `trackers`, `reid` and the `osnet_x1_0_sportsmot` weights, and of the data they were trained on
   (SportsMOT's licence may be non-commercial: say what it is and what that means for using the weights in Shooot).
2. **Embedding quality first** (the cheap, decisive test). Build a small ground truth on the window: about 10 people ×
   several crops each at different times, labelled by eye (use the previous spike's "name once" identities and check
   them). Compare `osnet_x1_0_sportsmot` with our OSNet x0.25 MSMT17 (and the generic `reid` models if any): same-player
   vs **same-team different-player** vs other-team distances, the rate a same-player pair beats a teammate pair, and the
   same as the time gap grows (the cookbook's sweep). This answers "does it tell teammates apart" directly.
3. **Tracking.** Run BoT-SORT + re-ID on the cached detections at the window's frame rate with the cookbook settings,
   then tuned settings (appearance threshold from step 2, lost buffer 5–30 s). Measure IDs created, fragments per
   person, ID switches counted by eye on the same sampled stretches as before (crossings, bunching at the goal). Then
   feed its tracklets into our offline gallery linking (`spikes/tracking/link.py`) with the new embeddings and measure
   again (identities, wrong labels in the same 20 frames).
4. **Cost:** CPU ms per crop for each encoder, seconds per minute of footage; what this means for a full match on this
   Mac, in the browser (ONNX export possible?), and on a GPU.
5. Verdict: adopt (online, offline, or both), and what it changes for per-player stats and the minimap.

## Deliverables

- `spikes/reid2/REPORT.md`: numbers, tables comparing old vs new, what was checked by eye vs assumed, licences, verdict.
- A ≤ 60 s 720p side-by-side or overlay clip with the new identities (under ~8 MB) and a distance-distribution plot,
  copied to `/Users/foundersfactory/Claude Files/shooot-tracking/`.

Time box: about 90 minutes. Final message: status, report path, deliverables, key numbers (teammate-vs-self
separation old vs new, identities, ID switches, cost per minute), licence finding.
