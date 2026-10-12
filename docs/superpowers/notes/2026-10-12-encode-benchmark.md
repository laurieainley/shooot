# Full match re-encode benchmark (2026-10-12)

What was measured: the real `renderReel` re-encoding path (`render/transcodeEngine.ts`, journaled, OPFS output) driven
through the `/bench` page in real Google Chrome 154 on macOS (4 logical cores, 16 GB, VideoToolbox: every run reports
`hardwareAcceleration: prefer-hardware` and the speed confirms a hardware encoder). Clips are 2 minutes of the founder's
own footage (not committed). No graphics in these runs. Quality = ffmpeg SSIM and libvmaf (default model), first 20 s,
compared at 1920x1080 against the source decoded and scaled by ffmpeg, best of -1/0/+1 frame alignment. "49 min" columns
are linear extrapolations of the 2-minute runs.

| clip | out | Mbps | wall | x realtime | size | 49 min | SSIM | VMAF |
|---|---|---|---|---|---|---|---|---|
| gopro-4k (HEVC 90 Mbps) | 4K | 15 | 94 s | 0.78 | 224 MB | 5.4 GB | 0.983 | 87.2 |
| gopro-4k | 4K | 20 | 102 s | 0.85 | 297 MB | 7.1 GB | 0.984 | 87.6 |
| gopro-4k | 4K | 30 | 104 s | 0.87 | 445 MB | 10.7 GB | 0.986 | 88.0 |
| gopro-4k | 1080p | 8 | 85 s | 0.71 | 121 MB | 2.9 GB | 0.978 | 85.7 |
| gopro-4k | 1080p | 10 | 82 s | 0.68 | 150 MB | 3.6 GB | 0.979 | 86.1 |
| gopro-4k | 1080p | 12 | 83 s | 0.69 | 180 MB | 4.3 GB | 0.980 | 86.4 |
| handbrake-4k (H.264 7.5 Mbps) | 4K | 15 | 87 s | 0.73 | 216 MB | 5.2 GB | 0.996 | 96.8 |
| handbrake-4k | 4K | 20 | 93 s | 0.78 | 287 MB | 6.9 GB | 0.996 | 97.1 |
| handbrake-4k | 4K | 30 | 104 s | 0.87 | 429 MB | 10.3 GB | 0.997 | 97.4 |
| handbrake-4k | 1080p | 8 | 66 s | 0.55 | 116 MB | 2.8 GB | 0.991 | 94.5 |
| handbrake-4k | 1080p | 10 | 65 s | 0.55 | 145 MB | 3.5 GB | 0.992 | 94.9 |
| handbrake-4k | 1080p | 12 | 66 s | 0.55 | 173 MB | 4.2 GB | 0.992 | 95.1 |
| pixel-4k (HEVC, VFR) | 4K | 15 | 104 s | 0.87 | 216 MB | 5.2 GB | (0.84) | 91.1 |
| pixel-4k | 4K | 20 | 100 s | 0.83 | 287 MB | 6.9 GB | (0.85) | 95.8 |
| pixel-4k | 4K | 30 | 117 s | 0.98 | 426 MB | 10.2 GB | (0.86) | 99.1 |
| pixel-4k | 1080p | 8 | 66 s | 0.55 | 116 MB | 2.8 GB | (0.83) | 85.1 |
| pixel-4k | 1080p | 10 | 69 s | 0.58 | 145 MB | 3.5 GB | (0.84) | 89.3 |
| pixel-4k | 1080p | 12 | 68 s | 0.57 | 173 MB | 4.2 GB | (0.84) | 92.2 |
| gopro-1080 (HEVC 40 Mbps) | 1080p | 8 | 38 s | 0.37 | 106 MB | 2.9 GB | 0.967 | 78.6 |
| gopro-1080 | 1080p | 10 | 39 s | 0.37 | 131 MB | 3.6 GB | 0.969 | 80.8 |
| gopro-1080 | 1080p | 12 | 44 s | 0.43 | 157 MB | 4.3 GB | 0.971 | 82.2 |

Brackets: SSIM of the Pixel clip is unreliable (the VFR source drops frames and ffmpeg's `fps` filter picks different
frames than the engine's nearest-picture rule); VMAF (luma only) is the usable number there.

Other measurements (gopro-4k unless noted)
- Direct frame pass (4K to 4K, nothing drawn) vs always through the canvas: 102 s vs 129 s at 20 Mbps (0.85x vs 1.08x).
- 4K 20 Mbps with title/full-time cards, captions, score bug and three replays (120 s clip, 157 s of output): 190 s (1.21x).
- Painting only (title card + 4 overlays per frame, forced to finish): 22 ms/frame at 1080p, 70 ms/frame at 4K, so
  the 5 s cards cost about 3 s (1080p) / 10 s (4K) once per match.
- Every output decodes clean (`ffmpeg -v error -f null -` prints nothing), audio and video durations match to
  10 ms, frame rate is constant (the Pixel VFR clip: 3585 frames at exactly 30 fps over 119.5 s), key frame every 2.0 s.
- Memory: JS heap peaks 140 to 185 MB and does not grow over 2 minutes; whole-Chrome RSS is flat within noise;
  VideoFrames made = closed in every run (counted in the diagnostics notes).
- Interrupted at 45% (page reloaded), resumed from the saved units: valid file, no gaps, constant frame rate.

Choosing defaults
- 4K: 20 Mbps. 15 to 20 Mbps buys +0.4 VMAF on noisy GoPro footage and +4.7 on the Pixel clip for +33% size; 30 Mbps
  adds only +0.4 more (GoPro) for +50% size and is the slowest. 20 Mbps is about 7 GB per 49 minutes (GoPro raw: ~30 GB).
- 1080p: 10 Mbps. 8 to 10 Mbps is +0.4 (GoPro 4K) to +4 (Pixel) VMAF; 12 Mbps costs +20% size for +0.3 to +3.
  10 Mbps is about 3.6 GB per 49 minutes.
- Time shown in the UI: 4K "about 1x the match length", 1080p "about 0.75x" (measured 0.55 to 0.98 and 0.37 to 0.71 with
  hardware encoding; conservative because slower machines, software encoders and graphics add time).

Chrome's hardware encoder vs ffmpeg's (20 s of gopro-4k at 4K, same metric): Chrome 20 Mbps VMAF 87.6, ffmpeg
h264_videotoolbox 20 Mbps 92.2. WebCodecs gives no control over B-frames/reference frames, so the browser export is a
bit less efficient than HandBrake with the same encoder.

## HandBrake preset for pre-converting GoPro 4K

ffmpeg 20 s of gopro-4k to 4K H.264/H.265, VMAF/SSIM vs source (same metric as above):

| encoder | setting | size per 20 s | 49 min | time (20 s clip) | SSIM | VMAF |
|---|---|---|---|---|---|---|
| VideoToolbox H.264 | 7.5 Mbps (current) | 18 MB | 2.6 GB | 24 s | 0.983 | 89.4 |
| VideoToolbox H.264 | 12 Mbps | 29 MB | 4.2 GB | 25 s | 0.986 | 91.0 |
| VideoToolbox H.264 | 15 Mbps | 36 MB | 5.2 GB | 25 s | 0.987 | 91.6 |
| VideoToolbox H.264 | 20 Mbps | 48 MB | 6.9 GB | 25 s | 0.988 | 92.2 |
| VideoToolbox H.264 | 25 Mbps | 60 MB | 8.6 GB | 20 s | 0.989 | 92.6 |
| VideoToolbox H.265 | 7.5 / 10 / 15 Mbps | 18 / 24 / 36 MB | | 17 s | 0.983 / 0.985 / 0.986 | 88.7 / 89.7 / 91.1 |
| x264 medium | CRF 18 / 21 / 24 | 97 / 52 / 26 MB | | 197 / 159 / 116 s | 0.993 / 0.991 / 0.988 | 93.4 / 92.7 / 91.8 |
| x264 veryfast | CRF 21 | 44 MB | | 52 s | 0.990 | 91.7 |

Recommendation: HandBrake, "H.264 (VideoToolbox)", 4K, frame rate "Same as source" + "Constant", average bitrate
**15 Mbps** (20 Mbps for matches you care about most), profile High, key frame every 30 frames as now, audio AAC
160 kbps (or AAC passthrough). 7.5 to 15 Mbps is the steep part of the curve (+2.2 VMAF for 2x size); beyond 20 Mbps
returns are small. H.265 saves nothing here and decodes in fewer browsers. x264 is not worth it: CRF 21 is
+0.5 VMAF over VideoToolbox 20 Mbps at 6x the time. With the new Full match 4K / 1080p options this pre-conversion is mostly
unnecessary: export "4K" at 20 Mbps straight from the GoPro files.
