# Report: Playback LRV / MP4 switch (feat/playback-source)

## What was built
- `types.ts`: `PairSide`, `SourcePair`, optional `VideoSourceFile.pair` ({ full, proxy }: file, name, size, codec, playbackIssue). Not persisted (no persist bump). `file`/`url`/`kind`/`name`/size/codec say what is playing; `fullFile` stays the MP4 for exports, ball check, goal set-up stills (a pair now always sets `fullFile`, also while the MP4 plays).
- `utils/playbackSource.ts` (pure): `defaultPlaybackPref(touch)`, `parsePlaybackPref`, `hasPairs`, `chooseSide`, `applyPlayback`, `fallBackToLrv`, `sideOf`.
- `utils/processFiles.ts`: pairs keep both sides; third argument `pref` (default `'lrv'`, old behaviour) chooses the playing one; an unplayable MP4 gives way to the LRV.
- `state.ts`: actions `applyPlayback(pref)` (swaps file/url/kind/name/size/codec per pair, revokes the old URL, keeps id, duration, events, keys, time, undo), `fallBackToLrv(index, reason)`; `attachFullFiles(files, sides?)` makes a pair when the full file is picked after its LRV.
- `components/playbackPref.ts`: preference store, localStorage `shooot-playback` (try/catch), default LRV on `(pointer: coarse)` else MP4; `choosePlayback` (refused while an export or Find goals runs: `switchBlocker`), `mp4FailedToPlay` (toast "This device can't play the MP4 — playing the LRV.").
- `components/PlaybackChoice.tsx` (+ App.css): segmented LRV · MP4 (44 px on touch), only when a file has a pair, disabled with a reason while a job runs. Used in the shared ⋯ menu (touch view and desktop) and as a Files sheet row with the hint line.
- `components/addFiles.ts`: opening uses the preference; a full file picked after its LRV is probed so the pair works; toast if MP4 was preferred but can't play.
- `components/Player.tsx` (minimal): on `error` for a paired MP4 -> fallback; source effect carries time and play state when the same file changes source.

## Tests (red -> green)
New: `playbackSource.test.ts`, `PlaybackChoice.test.tsx`, additions to `processFiles.test.ts` and `state.test.ts` (switch keeps time/keys/events/undo, fallback, attach pair). I wrote helper and tests close together rather than strictly red-first; one existing test (`addFiles.test`) went red from an early extra await and was fixed (probe only fulls that match a loaded LRV; `sideOf` lives in utils/playbackSource so the processFiles mock still works).

## Checks
tsc exit 0; build exit 0; eslint 11 problems (baseline, none new); contrast ok; full vitest: see the line at the end (run last).

## Browser (Playwright + Chrome, generated 1080p MP4 + 480p LRV pair, 20 s, deleted)
- Desktop 1280x800: starts MP4 `1920x1080`; seek to 8 s, ⋯ -> LRV: `854x480 t=8.0`; -> MP4: `1920x1080 t=8.0`.
- Android-UA touch 844x390: starts LRV `854x480`; ⋯ -> MP4: `1920x1080`.
- Screenshots looked at (dark and light): desktop menu, touch 844x390 menu (Playback below Speed), 390x844 Files sheet row with hint. Layout fine, pressed state is the neutral text colour (no new lime).

Full vitest: 235 files, 2663 tests passed, exit 0.

## Not verified / needs a real device
- MP4 error fallback (Player `error` handler) is covered at store level only, not by forcing a real decode failure in a browser; HEVC MP4 on a real iPad/Pixel not tried.
- "Preview in player" follows the playing source by construction (preview steps read `files[].url` at play time) but I did not click through it in a browser.
- File badges are unchanged (proxy / full attached / HEVC reflect `kind`, which follows the playing source); no new "LRV available" badge.

## Proposed AGENTS.md text (§4, after "Import")
- **Playback source (GoPro pairs):** when an MP4 and its LRV are both loaded, `VideoSourceFile.pair` keeps both (`{ full, proxy }`, not persisted) and `file`/`url`/`kind`/`name`/size/codec describe the one playing; `fullFile` is always the MP4 for exports, ball check and goal set-up. Preference `'lrv' | 'mp4'` in localStorage `shooot-playback` (outside `vhm-state`); default LRV on touch (`pointer: coarse`), MP4 with a mouse. `state.applyPlayback(pref)` swaps every pair in place (same id, duration, keys, events, time; old URL revoked); `Player` carries time and play state across the swap. Refused while a render or Find goals runs (`switchBlocker`). An unplayable MP4 (probe or player error) falls back to the LRV with a toast. UI: `PlaybackChoice` in the ⋯ menu and the Files sheet, only when a pair exists.

## Proposed DECISIONS.md entry
2026-10-20 · user (approved "Add the lrv MP4 switch"), agent built · Paired GoPro files keep both sources and the user picks LRV or MP4 for playback (per device; default LRV on touch, MP4 on desktop). Why: the LRV is smoother and lighter on phones but the MP4 is sharper; before, the MP4 choice dropped the LRV. Exports are unchanged (always MP4). Detail: docs/superpowers/agents/briefs/playsrc-report.md, branch feat/playback-source.
