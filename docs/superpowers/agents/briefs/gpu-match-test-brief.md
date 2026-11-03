# Brief: one-match rented-GPU test (throwaway)

**Question:** with one full match processed on a rented GPU at the full frame rate, do player tracking, possession,
passes, shots and "ball in the net" become reliable enough to show people? What does it cost in upload size, wall time
and money?

**Consent (user, 2026-11-03):** the user agreed to upload **one** match, `/Users/foundersfactory/Downloads/TNF full match
17-09-26.mp4`, to a rented GPU for this test. Nothing else may be uploaded. Provider: **Modal** (pay per second, CLI
driven). Delete the remote volume and any outputs stored there when the run is done, and say so in the report.

Read `docs/superpowers/agents/common-rules.md` first. Spike rules: code in `spikes/gpu/` (git-ignored via `spikes/`), no
commits, no product code, never edit AGENTS.md/CLAUDE.md, only the footage named here, keep local temporary media under
3 GB (disk has ~15 GB free), delete generated media > 5 MB except deliverables, long jobs in the background with a log,
no background processes left at the end. Another spike runs on this Mac at the same time: encode with `nice -n 10`.
Never print, log or commit the Modal token.

## Start from

- `spikes/tracking/REPORT.md`, `STATS-REPORT.md`, `REID-REPORT.md`: the CPU pipeline (RF-DETR nano people + ball on 4K
  crops, ByteTrack, team colours, OSNet x0.25 re-ID, possession state machine, passes/shots, goal-mouth crossing,
  fisheye profile in `spikes/tracking/lens/`) and its known limits (5–10 fps, 2-minute windows, teammates confused,
  far-goal false alarms). Reuse that code on the GPU rather than rewriting it.
- Goal labels: `spikes/clipbench/bundle/shooot-clip-test/clips.csv` (match 0917, label 1).

## Phase A — prepare (do now, no upload)

1. **Payload.** From the 4K source make (a) a 1080p H.264 CRF 23 copy of the whole match at the source frame rate and
   (b) source-resolution crops of each goal mouth (mark the six goal points yourself on one frame; pad generously so a
   shot's last metres are inside), H.264 CRF 18–20. Report each file's size; target about 1–1.5 GB total. Check by
   eye that the crops line up with the goals for the whole match.
2. **Modal job** (`spikes/gpu/modal_job.py`): install `modal` into a fresh venv `spikes/gpu/.venv` (Python 3.10+). An
   image with torch CUDA, rfdetr, supervision, OpenCV, torchreid/OSNet weights. A volume for the payload. One function
   that runs, for every frame at the source rate: a larger RF-DETR (small or medium, COCO person + sports ball) on the
   1080p copy, RF-DETR on the goal-mouth crops for the ball, ByteTrack, OSNet embeddings for each track sampled a few
   times per second. Output compact JSON/Parquet (tracks, boxes, ball positions, embeddings) — not video — and download
   it. Pick the GPU (T4 / L4 / A10G) by expected cost; estimate it before running.
3. **Dry run locally** on a 20 s cut of the payload (CPU, the same function body) so the GPU run doesn't fail on a typo.
4. Stop and report: payload sizes, the estimated GPU time and cost, the exact upload and run commands. The main session
   will get the user to authenticate (`modal setup`) and then tell you to run Phase B.

## Phase B — run (only when told)

5. Upload, run, download the outputs, delete the remote volume. Record upload time, GPU wall time, cost.
6. **Analyse locally** with the spike code: identities after re-ID merging over the whole match, possession %, passes,
   shots, goal-mouth crossings. Compare with the CPU spike's 2-minute window (same stretch) and with the goal labels
   (recall, false alarms, timing error). Watch the frames for ~20 sampled passes, shots and crossings each and count
   true/false/missed.
7. Verdict per stat (show / show with caveat / not reliable) and what still fails at 30 fps.

## Deliverables

- `spikes/gpu/REPORT.md`: Phase A (payload, cost estimate, commands); after Phase B the results, the verdict table, the
  costs, confirmation that the remote data was deleted.
- After Phase B: a ≤ 60 s 720p overlay clip (under ~8 MB) and stills, copied to
  `/Users/foundersfactory/Claude Files/shooot-gpu/`.

Time box: Phase A about 60 minutes; Phase B about 90 minutes after it is started. Final message per phase: status,
report path, the key numbers.
