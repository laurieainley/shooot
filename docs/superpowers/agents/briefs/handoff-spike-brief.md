# Brief: spike — can one 4K re-encoded MP4 join pieces made by two different H.264 encoders and play cleanly in QuickTime?

Worktree: `.claude/worktrees/handoff-spike` (branch `spike/handoff`, from main). Port **5205** if you need a dev server. Do not merge.
Rules: `docs/superpowers/agents/common-rules.md` (read it). Spec: `docs/superpowers/specs/2026-11-10-prepare-on-the-go-design.md`
("Joining pieces from two encoders"). Read AGENTS.md §5 (rendering rules, esp. the splice/sample-entry bullets) and the
"Full match output quality" + "Unit cache" paragraphs. Code: `src/render/transcodeEngine.ts` (the `drain` / `vConfig` /
`description` check ~405–430 that throws "the encoder changed its profile or level"), `src/render/unitCache.ts`, `src/render/nal.ts`
(`withInbandParams`, HEVC `covers`/`pickSampleEntry`/`raiseEntry`).
Scratchpad: `/private/tmp/claude-501/-Users-foundersfactory-code-shot-stopper/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/handoff-spike`
(symlink `../pw2/node_modules` as `node_modules` for Playwright).

## Question

A phone/iPad prepares 4K full-match units (each unit starts on a key frame, its own `VideoEncoder`); the Mac later renders the
same export, restoring those units from a cache and encoding only changed units with its own encoder (VideoToolbox). The two
encoders emit different SPS/PPS. Can the engine produce one MP4 that decodes cleanly in **AVFoundation/QuickTime** (and Chrome,
ffmpeg)? Stand-in for "another device": Chrome WebCodecs `hardwareAcceleration: 'prefer-software'` (OpenH264) vs
`'prefer-hardware'` (VideoToolbox) on this Mac. First confirm their parameter sets really differ (log both avcC). If OpenH264
cannot do 4K at the level used, use `ffmpeg -c:v libx264` with matching size/fps/GOP/profile as the second encoder.

## Try, in order (stop at the first that passes)

A. Keep one `avc1` sample entry (the first encoder's, or one raised to cover the highest profile/level/size), put each unit's
   own SPS/PPS in-band on its key frames (both IDR NALs prefixed with SPS+PPS).
B. `avc3` sample entry (parameter sets only in-band).
C. Multiple sample descriptions in `stsd` (one per encoder, chunks pointing at theirs) — only if Mediabunny or a small post-mux
   rewrite can do it in reasonable time; otherwise describe what it would take.

Pass = `ffmpeg -v error -i out.mp4 -f null -` silent; `swiftc -O scripts/avcheck.swift` run on it clean (no gap > 0.1 s, decodes
to the end); frames 1 s before/after each join extracted with AVFoundation (or `ffmpeg`) and LOOKED at (right picture, no
green/grey/black); Chrome `<video>` plays through (Playwright: currentTime reaches the end, no error). Use generated media:
4K HEVC Main 1 s GOP 29.97 fps + AAC, ≤ 20 s, a moving pattern + counter so joins are visible; at least 3 joins alternating
encoders. Delete media > 5 MB at the end (keep the small frame PNGs; copy 4 key ones to `~/Claude Files/handoff/`).

Prefer doing it through the real engine (e.g. a bench-only or test-only switch to encode chosen units with the software
encoder, or a cache-restore of units made by the other encoder) so the result says something about `transcodeEngine`; a
standalone Mediabunny script is acceptable if wiring is too heavy — say which. Keep production behaviour unchanged by
default; anything you add to `src/` is behind an option that is off unless set.

## Report

Write to `/private/tmp/claude-501/-Users-foundersfactory-code-shot-stopper/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/handoff-spike/report.md`:
avcC of both encoders (profile/level/size and how they differ), each approach tried with its exact result (command output,
avcheck output, what frames showed), the recommendation (A/B/C/none) and what production code would have to change (files,
functions), risks for real iPad (VideoToolbox, likely same SPS as the Mac?) and Pixel (MediaCodec) pieces. Commit any useful
code on the branch. Reply with status, commits, the verdict in one line, concerns, report path.
