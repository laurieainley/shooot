# Brief: Cancelled export blocks every later export until reload (fix/render-stuck)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/renderstuck. Dev port 5209. Read docs/superpowers/agents/common-rules.md and follow it (~60 min).
Report: docs/superpowers/agents/briefs/renderstuck-report.md (commit it). Scratch (throwaway media, logs, screenshots):
/private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/renderstuck/.
Another agent is working on the known-final-score reminder (scoreGap, GoalsTally, SuggestionSummary, ReelSummary, MatchDetails, toasts) — don't touch those.

## User report (2026-10-21, Mac Chrome 154, real GoPro 4K footage)
> "Tried to do a full match render - stopped and then tried a save to disk, started but then immediately stopped, now no renders/saves work"
(Full match export, Cancel, then a "Save to file" export (the `targetFile` path), which "started then immediately stopped"; afterwards no
render or save starts until — presumably — a reload. The diagnostics they pasted were an older successful 4K run (Copy diagnostics keeps the
last finished report), so there is no report of the failure itself.) Their last 4K full match spent most of its time in encoder
back-pressure (2,893 s of waiting over 95k frames, 2 parallel units, tab hidden 7 times).

## Main session's reading of the code (verify, don't trust)
`src/renderJobs.ts`: `cancel()` aborts and sets `stopWait = current.ended`; `start()` while `stopWait` is set sets `queued` and awaits it; a
second start while queued returns 'busy'. If the cancelled engine run never settles (a promise in `transcodeEngine` / `unitPool` /
`waitForQueue` / `muxUnits` / the target-file writer that doesn't observe the abort), `stopWait` never clears: the queued export waits
forever and every later start is 'busy'. `RenderStatus` shows "Stopping the previous render… yours starts next." while queued — check what
the user actually sees in each state, and why it could look like "started then immediately stopped".

## Build
1. **Reproduce** with generated media: a ≤ 30 s 4K HEVC or H.264 clip (or two files) in the scratch folder, Full match at 4K (and 1080p),
   Cancel mid-way while units run in parallel, then start (a) another Full match, (b) a Save to file export (you can stub
   `showSaveFilePicker` in Playwright if needed), (c) a Highlights export. Log whether the engine promise settles after abort and how long.
   Also try cancelling during finalize/mux and while the tab is hidden if you can. Write down exactly which await hangs.
2. **Fix the root cause**: every await on the render path observes the abort (encoder back-pressure wait, unit pool scheduling, decoder
   reads, mux, target-file writable — abort/close it on cancel so the picked file isn't left locked), and the engine's run settles promptly
   (target: < 2 s after Cancel). Close encoders/decoders/VideoFrames on abort (no leaks; keep the made/closed counters honest).
3. **Safety net in renderJobs**: a cancelled run that hasn't settled after a bounded time (e.g. 8 s) no longer blocks: clear `stopWait`,
   `stopping`, `queued`, let the next export start, and ignore anything the old run reports (it already checks the job id). Note it in the
   next export's diagnostics ("The previous export took too long to stop"). Make sure two runs can't corrupt each other's OPFS journal
   folder (same kind) — if they could, the new run must use a fresh job or wait for the old journal to be released; explain what you chose.
4. **UI**: while waiting for the previous export to stop, the Export button and panel show that clearly (no silent "nothing happens"); a
   failed start always shows a reason. Plain wording.
5. **Failures are visible**: if a Save to file run stops immediately (e.g. the picked file can't be written, permission lost), the job ends
   as Failed with the reason and a diagnostics report — never silently disappears.
6. Copy diagnostics should be from the latest run that ended (failed or cancelled-with-error too), not only the last successful one — check
   how the "last diagnostics" are saved and fix if a failed run doesn't replace it (cancelled runs may keep the previous one; say what you did).

## Constraints / rules
AGENTS.md §5 (render rules — don't regress; no timers on the render path except this cancel safety net, which is UI-side and must not throttle
the render), §8 tests. Don't unit-test engine internals: pure helpers + renderJobs store tests (it has deps injection) + real renders.
TDD for renderJobs (cancel → start never hangs when the old run doesn't settle; old run's late results ignored).

## Verify
Full checks per common-rules (test:run, tsc, build, `npx eslint src` baseline 11). Real renders of generated media: cancel-then-restart
sequences above all succeed; `ffmpeg -v error -i out.mp4 -f null -` prints nothing for the finished outputs. Report: which await hung, the fix,
timings from Cancel to settled, what wasn't verified (real GoPro 4K on a Mac, real Save to file permission prompts). Propose AGENTS.md /
DECISIONS.md text (don't edit them). Do not merge or push. Stop your dev server; delete media > 5 MB.
