# Report: cancelled export blocked every later export (fix/render-stuck)

## Root cause (reproduced)
Natural runs on generated 4K H.264 media always settled 130-180 ms after Cancel (Original, 4K, 1080p, Save to file, cancel at 5-95%), so the real hang needs a stalled codec. I simulated one in Playwright (`VideoEncoder` that stops dequeuing after 40 frames, full queue, flush never resolves, what a wedged hardware encoder or hidden tab looks like). Before the fix: Cancel never settled (`stopping` true for 45 s+), the next start sat in `queued`, any later start returned 'busy' with nothing shown. Cause: the awaits on the render path did not observe the user's abort.
- `transcodeEngine.encodeUnit`: `waitForQueue(enc, n, failed.signal)` watched only the encoder's own error signal, not Cancel; `enc.flush()` and the packet writes had no abort either.
- `runSegment`: `iterator.next()` (decoder) was not abortable; `iterator.return()` in `finally` waits behind a stuck `next()`.
- `segmentEncoder.encodeSegment` / `graphicsSession` (Original path: cards, overlay spans): same pattern (queue wait, `flush`, `decoder.flush`).
- Final `output.finalize()`, `muxUnits` writes/finalize: not abortable.
After the fix, with the wedged encoder: cancel to settled 132-138 ms (Original and 4K).

## Fixes
- `src/render/abortable.ts` (+test): `abortable(promise, signal)`, `anyAbort`, `cancelledError`.
- transcodeEngine: Cancel (or the pool giving up on a unit: new `env.stop`) closes the encoder and ends every wait; decode reads, unit writes, flush, drain, finalize are abortable. `iterator.return` is not awaited once aborted. VideoFrames still closed (made/closed counters unchanged).
- segmentEncoder/graphicsSession/mediabunnyEngine: `encodeSegment(..., signal)`, `session.signal`; decoder queue wait and flush abortable. muxUnits: writes/finalize/result abortable.
- Journal guard: `claimJournal/ownsJournal` (render/renderJob.ts). A cancelled run that is given up on and wakes later may only `discardJob(kind)` if no newer run claimed that kind, so it cannot delete the new run's journal. Residual risk: a woken old run could still append one in-flight packet to the shared unit log folder; it checks abort before each frame so this is at most one write; a new run of the same kind starts from the saved job or a fresh one (signature-checked), never a half-written unit (units count only after `saveJob`).
- renderJobs safety net: `cancel()` now arms a UI-side timer (`STOP_GRACE_MS` 8 s, `deps.stopGraceMs`). If the old run has not settled it is given up on: `stopWait`, `stopping`, `queued` cleared, the queued export starts, a "Cancelled, but did not stop" diagnostics report is published, and the next export's diagnostics gets the note "The previous export took too long to stop (it was given up on)". Old run's late results are ignored (job-id guarded; its abort check throws before download/notify).
- Failures visible: a failure before the engine reports (request preparation, picker) now ends as Failed with a plain reason AND a diagnostics report (`RenderDiagnostics`, saved as last report). `saveExportToFile` no longer drops a picker error silently (Failed job: "Could not open the save dialog: ..."). `makeTarget` with a picked file that cannot be written throws "Could not write to the file you picked (...). Pick it again, or choose another place."
- UI: Export button shows "Waiting" (dot) while an export waits for the stopped one; panel shows "Stopping the export..." and, when queued, "Stopping the previous export... yours starts as soon as it has stopped." (visible, role=status).
- Diagnostics: the engine already saved cancelled/failed reports as the last report (`publishReport`); what was missing was (a) a stuck run never publishing (now published by the safety net) and (b) `RenderStatus` read the stored report once at mount (now read whenever no job is shown and after a stop ends), so Copy diagnostics shows the latest ended run including cancelled.

## Progress report (coordinator's extra item: "Clip 1 of 58 . 97%")
Could NOT reproduce the 97%-on-clip-1 stall on synthetic media (4 goals + replays, Original, normal and Save to file: bar rises 1% to 100% in step with clip numbers). Findings and what I changed:
- The label "Clip N of M" is meaningless for a full match (cuts are split around 29 replays), so Full match now says "Rendering the match . N%" (stage labels such as "Title card", "Graphics" unchanged); highlights keep "Clip N of M".
- Real freeze found: a re-encoded stretch (overlay window, replay crop; 4K HEVC is slow) reported progress only before and after, so the bar sat still for the whole stretch (5 s each on my 720p-ish run: flat for ~5 s per goal). Now `overlayCut` reports per 8 frames and the engine maps it into the cut's work share, so the bar and ETA move steadily (verified: Graphics 6% to 17% in ~1% steps).
- Hypothesis for the user's stuck 97%: the work meter is monotonic (`WorkMeter.shown = max`), so one early over-estimate would pin the bar at that value while the clip counter kept the stale index; I found no such path in the engine but couldn't test 12 GB GoPro 4K. Not verified; ask for Copy diagnostics from that run.

## Tests (red then green)
- renderJobs: 5 new "never stops" tests (start after 8 s grace, no wait when the old run stops, late results ignored, slow-stop note in next diagnostics, second start stays busy) and 2 "fails before the engine reports" tests: red (20 s timeouts / undefined diagnostics) then green.
- abortable.test (8), renderRequest.test (picker failure, cancel), RenderStatus (stopping line, queued text), ExportPanel (Waiting), renderSources (full-match label).

## Checks
- `npm run test:run`: 240 files, 2726 tests pass. `npx tsc -b --noEmit`: exit 0. `npm run build`: exit 0. eslint: 12 problems (10 errors, 2 warnings) = repo baseline; the only issue in files I touched is the existing `reusedLine` export in RenderStatus.tsx; I added none.
- Real renders (generated 30 s 4K H.264 + AAC, Chrome via Playwright, dev port 5209, server stopped): cancel then (A) full 4K full match OK, (B) Save to file 4K OK, (C) 1080p then Highlights OK, (D) cancel at 95% then full OK, (E) Save to file cancelled mid-way then Save to file OK, (F) tab marked hidden then full OK. Cancel to settled: 133-182 ms in all. `ffmpeg -v error -i out.mp4 -f null -` printed nothing for outputs A, B, E (the saved-to-file ones B/E read back from the picked file). C/D/F downloads were not captured by my script (finished state verified only). Wedged-encoder runs: settled in 132-138 ms (Original and 4K).
- Screenshots: one export panel screenshot (dark) at 1280x800 inspected (running state with Cancel). Light theme, phone widths and the new "Waiting" / "Stopping" lines were not looked at in a browser (covered by component tests only).

## Not verified
Real GoPro 4K HEVC on a Mac, real `showSaveFilePicker` permission prompts/locked files (stubbed with an OPFS handle), a genuinely hidden tab (simulated), hardware-encoder stalls (simulated), the user's 97% stall.

## Proposed AGENTS.md / DECISIONS.md text
AGENTS.md §5 (new bullet): "**Cancel must always get through.** Every await on the render path (encoder back-pressure, flush, decoder reads, unit/file writes, finalize, mux) observes the abort (`render/abortable.ts`); a unit's `env.stop` does the same when the pool gives up. renderJobs gives a cancelled run `STOP_GRACE_MS` (8 s) to settle, then abandons it so the next export can start (its late results are ignored; `claimJournal/ownsJournal` stop it deleting a newer run's journal). A failure before the engine reports still ends as Failed with a diagnostics report."
DECISIONS.md: "2026-10-21 (agent): A cancelled export that does not settle within 8 s is abandoned instead of blocking every later export. Why: a stalled codec left `stopping` set forever, so no export could start until reload. Detail: docs/superpowers/agents/briefs/renderstuck-report.md." and "2026-10-21 (agent): Full match progress says 'Rendering the match' (no clip counter) and re-encoded stretches report as they go."
