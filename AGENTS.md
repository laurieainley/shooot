# AGENTS.md — Shooot

Instructions for any coding agent (Claude Code and its subagents, Codex, Cursor, etc.) and for humans new to the repo.
`CLAUDE.md` imports this file and adds only Claude-specific notes. Brand rules live in `brand/shooot/BRAND.md`.

---

## 1. What this is, and what stage it's at

**Shooot** turns an hour of amateur football footage (five-a-side) into a highlights reel with slow-mo replays, a
scorebug, captions and a full-time card, entirely in the browser. You load the match videos, tag moments (goal, save,
foul…), and export a reel or the full match.

- **Editor (the app):** https://editor.shooot.co.uk — React SPA at the repo root.
- **Landing page + waitlist:** https://shooot.co.uk — static site in `site/` (separate Vercel project).
- **Stage:** early and unvalidated. A handful of real users (the founder's five-a-side group). The waitlist is "for
  testing". There are no accounts, no backend for the editor, no analytics.

### Working principles for this stage

- **Validate before building.** Prefer the smallest change that lets a real user try the idea on real footage. Write
  a short spec first for anything bigger than a bug fix (`docs/superpowers/specs/`), and park ideas in
  `docs/superpowers/notes/ideas.md` rather than building them speculatively.
- **Local-first, no infrastructure by default.** Video never leaves the device; the editor keeps state in the browser.
  Add a server/database only when a validated feature needs it, and keep it cheap (free tiers) and replaceable.
- **Real footage is the test that matters.** Synthetic test clips catch regressions; GoPro 4K HEVC, iPhone MOV and
  Android VFR files on real devices find the bugs. Say clearly what was and wasn't verified on a real device.
- **Small, reversible increments.** Ship behind sensible defaults, keep old data loading (persist migrations), and
  never break a saved project or an open tab (see stale-build recovery).
- **Calm UI over features.** The user has pushed back on clutter: show only what's needed while tagging; settings
  live where they're used (Export). Lime means "primary action" or "goal", nothing else.
- **Honest reporting.** If a check was skipped or a fix is unverified, say so. Don't claim "fixed" without evidence.

---

## 2. Repo map

```
/                      Editor app (Vite + React). Deployed by Vercel project `shooot`.
  src/
    main.tsx, App.tsx  Entry; stale-build recovery; undo/redo keys
    state.ts           Zustand store (single source of truth), persisted to localStorage key `vhm-state` with
                       versioned migrations (check `version:` before changing persisted shape)
    types.ts           Shared domain types
    brand.ts           PRODUCT_NAME — the only place the product name is spelled
    renderJobs.ts      Render job manager (runs outside the UI; resume, cancel, wake lock, diagnostics)
    components/        One component per file, named exports. UI only; logic goes to utils/ or the store
    utils/             Pure functions (no React, no side effects) — every file has a *.test.ts
    render/            Rendering engine behind renderReel() (Mediabunny + WebCodecs)
    graphics/          In-video graphics: plan → layout → painters; themes/ (shooot, classic)
    files/             File-handle store (relink after reload on desktop Chrome/Edge)
  public/              Static assets, self-hosted fonts for canvas graphics, icons, manifest
  brand/shooot/        Brand pack: BRAND.md, tokens.css/json, motion.css, assets (source of truth for brand)
  site/                Landing page + waitlist (static HTML, Vercel Functions in site/api/)
  scripts/             check-contrast.mjs (brand colour contrast check)
  docs/superpowers/    specs/ (designs), plans/ (implementation plans), notes/ (audits, ideas)
  .claude/skills/      shooot-brand skill
  .claude/worktrees/   Agent worktrees (git-ignored) — see §8
```

## 3. Stack and commands

React 19 + TypeScript (strict) · Vite 7 · Tailwind 4 (CSS-first, tokens in `src/index.css`) · Zustand 5 ·
Mediabunny (MP4/MOV demux + mux) · WebCodecs (decode/encode for graphics, crops, audio) · video.js 8 (player) ·
idb-keyval (IndexedDB: file handles, logo, render journal) · Vitest + React Testing Library + happy-dom ·
self-hosted fonts (@fontsource Archivo variable, Big Shoulders Display, JetBrains Mono).

```bash
npm run dev        # https://localhost:5174 (the user's own dev server port — agents use another port)
npm run test:run   # all tests once (~1,400 tests)
npx tsc -b --noEmit
npm run build      # tsc + vite build
npm run lint       # baseline: 12 known problems — add none
```

- HTTPS is required (OPFS, phone testing): `mkcert localhost 127.0.0.1 ::1` → `localhost+2.pem` /
  `localhost+2-key.pem` in the repo root (git-ignored).
- `public/default-video.mp4` may be a dangling local symlink on the founder's Mac; if `npm run build` fails only on
  that file, it's local-only (Vercel is unaffected).

## 4. Domain model (read before changing logic)

- **Timeline:** several files form one ordered timeline. Events store `matchTimeSec` on the whole timeline
  (`computeCumulativeOffsets()`), plus a file key (`utils/fileKey.ts`: file name; GoPro chapter + recording; name+size
  when two files share a name).
- **Default file order:** GoPro chapter order for GoPro names, else recording time from the container
  (`utils/mp4Meta.ts`), else `lastModified`, else natural name order (`utils/fileOrder.ts`). Users can reorder.
- **Events:** types in `utils/eventTypes.ts` (goal, pen goal, own goal, penalty conceded, penalty missed, save, foul,
  highlight) + markers Kick off / Half time / Final whistle. Optional team, person, assist (goals), note.
  The match clock starts at Kick off; ends swap after Half time (replay zoom target).
- **Reel:** clip padding (default 10 s before / 4 s after), overlapping clips merge, scoring events get a slow-mo
  replay (default 4 s before → 1 s after at 0.5×, half volume). `buildRenderPlan()` turns events into cuts, splitting
  cuts that cross a file boundary.
- **Clip download:** a selected row's Download clip popover (`ClipDownload`) renders one event through `clipExport()`:
  its padding, its replay (option), a caption for that event only (score option; `buildGraphicsSpec` `captionEvents` /
  `captionScore` / `cards`), no title/full-time card, and a 3.5 s Shooot sting (`graphics/sting.ts`, outro
  `{ kind: 'sting' }`; a missing wordmark fails the sting visibly). Name: `outputFileName` clip form,
  teams but never the score (`Matchday 3 - Hawks v Lions - 13' Goal DJ.mp4`). After a finished clip the popover says
  "Downloaded: <name>" and its primary button is Download again; Render again is quiet. A quiet Cancel stops a running clip. Job kind `'clip'`: never resumable, doesn't save a timeline or the last diagnostics report;
  quality falls back to preview only for files the clip reads. Options persist as `clipOptions` (state v22).
- **Full match:** Kick off → Final whistle across files, stream-copied; score bug windows (Off / After goals /
  Periodic; after goals = 1 s after for 5 s, like the highlights caption) and event captions are the only re-encoded
  parts. Optional slow-mo replays (`fullMatch.replays`, `withReplays()` in utils/fullMatch.ts) split the match after
  each replay window and insert the slowed cut; the match resumes at the key frame (≤ 1 GOP repeats).
- **Full match output quality** (`fullMatch.quality`, persist v23): **Original** (default) is the stream copy above;
  **4K** / **1080p** re-encode the whole match to constant-frame-rate H.264 (`render/transcodeEngine.ts`, started by
  `RenderOptions.output`; plan fields in `utils/exportPlans.ts` `PlanOutput`; availability/size/time in
  `utils/outputQuality.ts`; pure planning in `render/transcodePlan.ts`; WebCodecs support probes in
  `render/transcodeSupport.ts`). Cards, captions, score bug, replay crops and slow-mo are drawn onto the canvas as each
  frame is encoded (no second pass). Journaled re-encodes (Full match and Highlights at 4K / 1080p; `ExportPlan.resumable`) run `PARALLEL_UNITS` (2, `transcodePlan.ts`) units at once, each with its own
  decoder/encoder/canvas/WebGL scaler (`runParallel` + the scheduler `render/unitPool.ts`): `planSegments` balances unit lengths and splits
  a short render so two exist (pieces >= `MIN_PARALLEL_UNIT_SEC`); units are written in order, the job is saved as the finished prefix
  grows, and a failure while two ran drops the rest of the render to one at a time and retries the unit (software encoder as the last
  resort). Estimates carry `parallelFactor()` (`utils/renderTime.ts`) and the engine's `estimateSec` includes it; learned rates
  (`shooot.renderRates.v1`, entries flagged `par`) are measured against that model. 4K is disabled for sources below 4K; either option is disabled with a reason when
  `VideoDecoder`/`VideoEncoder.isConfigSupported` says no. Audio: AAC is copied, anything else is encoded to AAC at 160 kbps.
  Resumable: units are the cards and ≤ 2-minute segments of output, each with its own encoder and a key frame at its
  start (an interruption loses at most the unit in progress); the output quality is part of the job signature.
  **Unit cache** (`render/unitCache.ts`): journaled re-encodes pass `RenderOptions.reuse` (`buildReuseKeys`, made by
  `components/renderRequest.ts reuseKeysFor`: footage identity, cut, graphics overlapping the unit, theme, logo hash, quality/bitrate).
  The engine adds its own facts (`unitFacts`: size, fps, key interval, encoder + hardware, scale path, audio) and `RENDER_VERSION`, hashes
  them to a unit key, and `restoreUnit` copies a cached unit's packets into the unit log (video back onto the frame grid, audio shifted)
  instead of encoding; `keepUnit` stores each finished unit (never when a graphic was skipped, the unit lacks frames or there is no room).
  Works in both the serial loop and `runParallel`. `planSegments(..., { stable: true })` keeps unit boundaries per cut. OPFS `unit-cache/`
  holds `<key>.bin` + `<key>.json` + `manifest.json` (the last export per kind); `finish()` prunes to that and the cap (`planEviction`).
  **When anything that changes pixels or packets changes (painters, themes, fonts, engine), bump `RENDER_VERSION`.** A cache read error is a
  miss. `storageRoom()` counts the cache as free; `clearSavedParts()` deletes it. Estimates: `reusableParts()` + `estimateRenderTime({ reused })`;
  `RenderProgress.reused` -> `RenderJob.reused` -> the "Reused N of M parts" line in `RenderStatus`; reused runs are not recorded as learned rates.
  **Storage fit and time:** `applyStorageFit()` (utils/outputQuality.ts) greys out options bigger than the site's free
  storage (`storageRoom()` in render/storage.ts: quota − usage + old outputs `clearOldOutputs()` frees, 10% margin) and
  auto-picks the largest that fits; no `estimate()` means no blocking. Time hints and the live ETA come from the render time
  model (see **Render time model** below), not fixed multipliers.
- **Highlights output quality** (`highlightsQuality` in the store, persist v24; `'auto'` = the device default, any other value is the
  user's explicit choice and sticks): the same Original / 4K / 1080p choice as Full match, via the shared `OutputQualityField`
  (segmented control) in `RenderHighlights`, the same option list (`qualityOptions`), availability rules (`useReencodeSupport`), size and
  time hints and `applyStorageFit` grey-out/auto-pick (the old warning-only `highlightsRoomWarning` is gone). `highlightsExport(state,
  'full', planOutput(q))` puts the output in the job signature; `RenderOptions.output` sends the whole reel (clips, replays, slow-mo,
  cards, captions, score bug, replay tag, sting) through `transcodeEngine` in one pass. Re-encoded cuts are frame-exact (no GOP snapping),
  so `onTimeline` chapters are exact; estimates for re-encoded reels have no key-frame slack (`DescriptionArgs.reencoded`). Defaults:
  Original on desktop/tablet; 1080p on a phone layout (`phone` or landscape phone; `resolveHighlightsQuality`) because on a Pixel Original
  is slowest (2.2x the reel on raw GoPro 4K: its replays/graphics are re-encoded HEVC 4K) vs 1080p ~1.0x, 4K ~1.25x; iPad Original 0.4x, 4K 0.84x; Mac
  Chrome Original ~0.5x, 1080p 0.7x, 4K 0.9x. Time hints are "for a N min reel" and follow the ticked options and the footage
  (`estimatePlanTime`). Highlights are not resumable.
  The plan is memoised from a shallow selector without the playhead, so the panel does not re-plan while the video plays.
- **Render time model** (`utils/renderTime.ts`; one model for the hint, the progress weights and the learned rates). A render is priced as
  units: copied source seconds (x source Mbps), decoded seconds (x source MP/s x fps, H.264 0.8x HEVC, + a per-Mbps read term), encoded
  seconds (x output MP/s x fps; Original re-encodes in the source codec: x `ko`), painted frame seconds (ms/frame, 1080p..4K interpolated).
  `cutUnits()`: **Original** copies the cut (+1 GOP) and re-encodes only the key-frame regions around overlay windows (window +-1.5 GOP) and
  whole cuts that carry a crop or the replay tag; **4K/1080p** decode and encode every frame and paint cards, crop cuts and overlay windows.
  `DEFAULT_COEF` per device class (`detectDeviceClass`: Android / iPad+iPhone / desktop by UA; unknown = Android, the slowest) is fitted to the
  benchmarks in `utils/renderTime.bench.ts`; `renderTime.test.ts` keeps every measurement within 25% (two Pixel outliers within 40%). Call
  `estimatePlanTime(plan, output, facts)` (exportPlans.ts) for `{ seconds, low, high, basis: 'typical' | 'this device' }`; `sourceFactsFor()`
  builds the footage facts (size/codec/fps from `useReencodeSupport`, bytes/s from the full files; defaults GoPro 4K HEVC 90 Mbps).
  **Learned rates:** a finished (not resumed) render records wall / model seconds per output path (`original`/`4k`/`1080p`) in localStorage
  (`shooot.renderRates.v1`, smoothed 0.5); the next estimate scales by it and says "going by your last renders" with a narrower range.
  **Progress** is the share of estimated work (`WorkMeter`, monotonic, 1 only at the end): `mediabunnyEngine` weights each cut/card by
  `planWork` and places the position inside a cut with `cutShare` (copy vs region cost); `transcodeEngine` adds per-frame work (plain vs
  painted). The first `onProgress` carries `estimateSec` (model total) which lands on `RenderJob.estimateSec`; `RenderJob.output` records the
  quality. **ETA** (`utils/renderEta.ts`): EMA of work-fraction per second blended with the model's expected total (x learned ratio),
  observation weight p/(p+0.1). Saved jobs' `done/total` are shares of work; older saved jobs are rescaled on resume.
- **Chapters:** YouTube chapter times come from the real render timeline (engine `onTimeline` → `renderTimelines.ts`,
  matched by plan signature); until then an estimate from the render plan, flagged in the UI.
- **Render storage:** outputs are written to OPFS first; `clearOldOutputs()` deletes earlier renders before each
  render (the per-site quota filled up otherwise); a quota error gets a plain message (`render/storage.ts`).
- **Goal areas / goal set-up:** per team (`team1`/`team2`), each the goal that team defends at kick-off ("Whites'
  goal", never "attacking"); `replayGoalFor()` picks the replay crop. Set in a guided full-screen layer
  (`components/goalSetup/GoalSetup.tsx`): choose the picture (6 thumbnails + scrubber) → Identify goal posts for each
  goal (touch: move the picture under a fixed crosshair, Set point; desktop: click) → Replay zoom for each goal (the
  replay view is the editor: drag / pinch, Closer / Wider / Reset, a frame map beside the buttons) → summary
  (`GoalSetupSummary`, also compact in New match and Match setup; cards use the team's kit colour). Persisted
  `goalMarks` / `goalAreas` unchanged; maths in `utils/goalSetup.ts`. Entry points: New match Goals step, Match setup,
  Find goals "Identify the goal posts first". The layer owns Esc and pushes a history entry so Android Back closes it.
- **Reel order:** segments sort by whole-timeline time (`cumulativeOffsets[file] + matchTimeSec`); the old
  "Adjust timestamps by offset" option is gone (persist v18 deletes it; Kick off defines the match clock).
- **Import:** ⋯ → Import… opens one dialog: left, a project `.json` from Export project (asks before replacing existing
  events); right, pasted goal times — one per line, `MM:SS`, `H:MM:SS` or seconds, optionally "Team - Scorer"
  (`utils/bulkPaste.ts`, live preview). Export project is its own menu item.
- **Known final score:** optional `knownFinalScore: Score | null` (persist v25), entered under the team cards in Match
  setup and the New match Match step (`MatchDetails`; New match passes `compact`, which leaves out logo and graphics
  style). Cleared by `newMatch()`; carried in project JSON and transfer links. `utils/scoreGap.ts` compares it with the
  tagged score (`finalScore()`): the Find goals tally's second line ("Final 13 – 9 · 3 to find" / "✓ All goals tagged" /
  "1 more than the final score (Whites)"), review summary lines, a quiet note in Export `ReelSummary`, and a one-off
  toast when tagging reaches it (`useAllGoalsToast` in `SuggestionReview`). Not on the scorebug, rail or cards; graphics
  and file names keep using the tagged goals.
- **Roster entry:** `RosterTags` = text field + Add button, "Previous players" suggestions under it, roster chips
  below (A–Z; tap to fix, × to remove). Enter / comma / Add / Tab add a name; Enter keeps focus so the phone keyboard
  stays up (`enterKeyHint="enter"`, key or keyCode 13, `beforeinput` `insertLineBreak`). `knownPlayers` (persist v26,
  `utils/knownPlayers.ts`) are this device's remembered names: recorded by `setTeams` / `addToRoster`, forgotten only via
  the × on a suggestion, capped at 200, not in project files or transfer links, kept by `newMatch()`.
- **Highlights preview:** plays the render plan's steps (`utils/preview.ts`). Zoom is locked (Z/0, wheel, pinch and drag
  do nothing; 1× on entry and exit); ▶ / Enter on a row or a strip event dot jumps to that clip inside the preview
  (`jumpToPreviewEvent`, `previewStepForEvent`) — events not in the reel leave the preview and seek as before; no
  playback-speed overlay during the preview.
- **Unknown event types** from saved state (persist `merge`, so every version), project import and transfer links go
  through `sanitiseEvents()` (utils/eventTypes.ts): aliases such as `kickoff` map to `kick_off`; anything else unknown is
  dropped, so one odd event never blanks the page. Export lengths are m:ss, or h:mm:ss from an hour.
- **Match history** (spec `2026-10-13-match-history-design.md`): every match is autosaved on this device to IndexedDB
  (`shooot-matches/matches`, one `MatchRecord` per match: the project payload + suggestions, clip options, file list,
  list summary — `utils/matchRecord.ts`, `files/matchStore.ts`). `useMatchAutosave` writes the open match 1 s after a
  change and on page hide; a match is saved once it has a file or an event. The open match id is in localStorage
  `shooot-open-match` (`components/openMatch.ts`, outside `vhm-state`: no persist version). File handles are per match
  (`match-handles:<id>`). `openMatch` / `startNewMatch` / `removeMatch` (`components/matchSwitch.ts`) save first, never
  ask to save/discard; only a running render or Find goals asks ("Exporting — switching stops it."). Undo resets on
  switching. New match no longer asks to clear (the old match stays in Matches).
- **Projects:** export/import JSON, and transfer links (`#p=`, deflate + base64url in the URL fragment — never sent
  to a server). Files are relinked by key on the receiving device.

## 5. Rendering — hard-won rules (don't regress these)

- **Stream copy first.** `renderReel()` copies encoded packets; only short windows are decoded/re-encoded (cards,
  captions, replay crops, mixed-size sources, replay audio). Output streams to OPFS so memory stays flat.
- **Spliced H.264/HEVC must decode everywhere, especially QuickTime/AVFoundation:**
  - every key frame carries its source's parameter sets in-band (`render/nal.ts` `withInbandParams`), and CRA → BLA at
    splice points;
  - the MP4 sample entry must *cover* every SPS in the track: profile, coded size, DPB, **and tier/level**
    (`covers`, `pickSampleEntry`, `raiseEntry`). GoPro 4K is HEVC Main level 6.0 (`general_level_idc` 180); a
    WebCodecs card is often 5.0. A lower-level sample entry → black picture in QuickTime after the card;
  - re-encoded overlay bitrate is capped at the entry level's maximum (`maxBitrateForLevel`);
  - AVFoundation configures from the sample entry, not in-band sets — test exports in QuickTime/Preview, not only
    Chrome/ffmpeg. A durable fix for very different sources may need multiple sample descriptions (not built yet).
- **Timing comes from packets.** Any GOP length (phones 1–4 s, GoPro 1 s); variable frame rate is normal on phones.
  Snap cuts to the footage's own key packets; card frame rate from the median frame gap.
- **Audio:** copied; clips in one render must share audio format (mixed → clear error). Files without audio get
  silence. Replays re-encode audio at half volume (`REPLAY_GAIN`); if re-encoding fails, fall back to silence — never
  full-volume audio.
- **Colour:** generated frames use the footage's matrix/range (`rgbaToI420`). Untagged footage can shift hue slightly
  in crops (known).
- **Re-encoding path** (Full match 4K/1080p): decode with Mediabunny's `VideoSampleSink`, pick the source frame for each
  output tick (constant rate: the footage's nominal rate, 50/60 fps halved), draw to an `OffscreenCanvas`, hand the canvas
  to a `VideoEncoder` (hardware preferred) and close every `VideoFrame` (the engine counts made/closed in the
  diagnostics notes). Frames that need nothing drawn and are already the output size skip the canvas. H.264 SPS may differ
  in colour signalling between units; only profile/level are checked against the saved sample entry.
- **4K -> 1080p scaling** (`render/downscale.ts`): drawing a 4K VideoFrame on a 2D canvas costs 100-240 ms/frame in WebKit
  (iPad/Safari). Plain frames go to the 1080p encoder unscaled (the encoder scales; `probeDirectScale` verifies once per
  render that the output is the whole picture at the right size); frames with graphics are scaled by a WebGL2 draw
  (`GlScaler`) then copied into the 2D canvas. Both fall back to the 2D canvas; "Always draw through the canvas" in
  /bench forces the old path. The scale path used is in the encoder notes.
- **Mixed frame sizes:** output = first used file's size; others are scaled to cover + centre-cropped (re-encoded),
  with a pre-render notice and time estimate.
- **Reading files:** always through `render/fileSource.ts` (8 MB aligned blocks), never `BlobSource` — Android USB
  storage costs ~0.25 s per read. Exception: the Find goals audio pass plans its own small audio-only byte ranges
  (`utils/readPlan.ts`, a few reads in flight) so it doesn't drag 4K video through 8 MB blocks; it reads the proxy/LRV
  when one is paired.
- **Graphics never cost the reel.** If graphics or a crop fail, render without them and list them under "Rendered
  without: <label> — <reason>". Every render produces a diagnostics report (Copy diagnostics) — ask users for it.
- **Background tabs:** no timers on the render path (Chrome throttles them in hidden tabs) — use `render/yield.ts`
  (`waitForQueue`, MessageChannel). Hold a screen wake lock while rendering. Phones/tablets suspend background pages
  entirely; renders resume from the OPFS journal.
- **Graphics:** themes in `graphics/themes/` (`shooot` default, `classic`). Fonts load per theme before painting;
  text is centred from measured canvas metrics, never per-platform baseline guesses. Canvas uses static font
  instances (variable width isn't reliable in canvas).
- **Don't unit-test engine internals**; test pure helpers (nal, frameGrid, overlayWindow, …) and mock `../render` at
  the component boundary. Verify engine changes with real renders of generated media and inspect frames.

## 6. Platform gotchas

- **iOS/iPadOS:** the file picker copies the whole file before the page gets it (minutes for 12 GB) — suggest LRV
  proxies; `accept` must be omitted on iOS or `.LRV` is greyed out; `HTMLMediaElement.volume` is read-only (use a Web
  Audio gain); Safari answers `canPlayType('')` for `hev1` — decide playability by loading the file.
- **Android:** Chrome reads files live from USB (fast open, slow random reads — see fileSource). `accept` is omitted
  on Android too, or `.LRV` is greyed out in the picker. Keyboard overlays fields (`useKeyboardInset`).
- **Desktop Chrome/Edge:** File System Access handles allow one-click relink after reload.
- **Benchmark page:** `/bench` (`bench.html`, `src/bench/`) runs the real render modules on a file or a synthetic clip and
  reports timings; not linked from the editor, `noindex`. Use it on a phone/iPad to measure export speed and catch errors.
  In dev open `/bench.html` (the `/bench` rewrite is Vercel's); benchmark a production build (`vite build` +
  `vite preview`), not the dev server, whose hot reload restarts a running benchmark.
- **Bench experiments** (`/bench` → Experiments, `src/bench/experiments.ts` + `src/bench/experiments/*`): candidate speed-ups measured as
  baseline/variant pairs on the first N seconds (default 45) of ONE file; "Run all experiments" or tick some; the **iPad / Pixel / Mac**
  presets (`src/bench/presets.ts`, the likely device is highlighted, never auto-applied) tick the stages + experiments for that device and
  one Start runs them all. Results go to a comparison table and into Copy results / Share JSON as an `experiments` array (existing shape
  unchanged). Every engine switch lives in `RenderOptions.experiments` (`render/experiments.ts`) and is **off by default**: with it omitted
  the editor's render paths behave exactly as before. Switches: `parallelUnits` + `segmentSec` (#1, now the default of 2; the bench forces 1, 2 or 3 and a small
  segment length), `unitCache: false` (#2, switches the production unit cache off; the segment-cache experiment turns it on by passing `reuse` keys), `targetFile` (#4, mux straight into a `showSaveFilePicker` file), `OverlayBitmapCache` passed to
  `prepareSpec` (#5, still stretches of captions/bug/tag drawn from bitmaps), `tightSpans` (#6, Original highlights re-encode only the
  visible part of each overlay window), `latencyMode` (#7), `encodeQueue` + `decodeAhead` (#9). #3 (render while a `<video>` plays) and #10
  (the engine in `renderWorker.ts`; graphics build in the worker through `self.fonts`) are bench-only. The re-encode now always counts
  where time goes (decode wait / paint+scale / encoder call / back-pressure / packet writes → diagnostics note, `onStats`, stage
  `detail.pipeline`), and stages can time the save step ("deliver": wrap + read the output back through its blob URL, after the stage
  clock stops). #11 (`scaler: 'webgpu'`, `render/gpuScaler.ts`): WebGPU scales every frame that is not already output size and blends the
  painted overlay canvas in the same render pass (`importExternalTexture` -> OffscreenCanvas 'webgpu' -> `new VideoFrame(canvas)`); one
  isolated hook in `transcodeEngine` (`GpuPath`), falls back to the normal path with a diagnostics note if WebGPU is unavailable or fails.
  **The three device presets currently tick ONLY #11** (no stages, deliver off; `ALL_EXPERIMENTS` still lists everything). How the highlights engine picks its re-encoded span is described at the top of `experiments/tightSpans.ts`.
- **Deploys while a tab is open:** stale lazy chunks are recovered by one guarded reload (`staleBuildRecovery.ts`);
  the render engine is warmed at idle.
- **Storage audit / bench Storage section:** `/bench` → Storage (`src/bench/storageInspect.ts`) shows `storage.estimate()` and every top-level OPFS entry with
  total size and file count (folders summed), with "Clear bench files" (outputs, kept copies, bench cache, the full-match job) and "Clear everything this site stored"
  (confirm; also drops saved export progress and saved parts). The same list is in the report as `device.storage.opfs`. Audit fixes: `makeTarget().discard()` aborts its
  writable (a never-closed writable keeps a swap copy); `canJournal` removes its probe file; unit-cache manifest/meta writables abort on a failed write; the cache cap is checked
  while an export saves parts (`hasRoomFor`, counting only parts newer than the last export) and a cancelled export `trim()`s what it saved. Not leaks by design: one finished output
  stays until the next render, one saved job folder per kind stays after a failed (not cancelled) export, bench kept copies stay until the next run or "Clean up storage".
- **Per-origin storage:** saved projects live in the browser per domain; moving domains loses them unless exported.

## 7. Code conventions

- **Utils are pure** and fully unit-tested; shared logic goes to `src/utils/` (no store imports there).
- **State** only in `src/state.ts`; derive computed values in selectors/`useMemo`. Any change to persisted shape needs a
  version bump + migration + test (also update project import and transfer-link decode paths).
- **Components:** one per file, named exports, props interface above the component, presentation only.
- **TypeScript:** explicit return types on exported functions; no `any` (use `unknown` + narrowing).
- **UI/brand** (see `brand/shooot/BRAND.md` and §1 "Calm UI"):
  - colours only via `--sh-*` tokens; lime = primary action + goals; red (`--sh-rec`) = live/recording/playhead only;
    lime never as text on light backgrounds (`--sh-lime-text`);
  - Archivo for UI, Big Shoulders (shirt font) for player names/numbers, JetBrains Mono for clocks/scores/keys;
  - "Shooot" in running text, sentence case, UK English; brand voice only in empty/progress/success states
    (`utils/voice.ts`); errors and instructions stay plain; we "tag" moments (not "mark");
  - touch targets ≥ 44 px, text ≥ 14 px on touch (base rules later in App.css beat the touch block: restate 14px in the `pointer: coarse` block at the end of the file), contrast ≥ 4.5:1 (`node scripts/check-contrast.mjs`), respect
    `prefers-reduced-motion`, never red-vs-green alone to distinguish meanings.
- **Picture gestures** (`components/pictureGestures.ts`): while zoomed, mouse drag or **one finger** pans (a tap still plays /
  pauses); two fingers pinch-zoom (1×–4×) and pan; wheel / trackpad pinch zooms. Leaving the page while a render or
  Find goals is running asks first (`useLeaveWarning`).
- **Keyboard:** one window-level handler (`Player.tsx` + `utils/shortcuts.ts` + `components/playerShortcuts.ts`);
  shortcuts work wherever focus is, except in text fields/menus/tabs, controls inside a dialog (`[role=dialog]`,
  `[aria-modal]` — dialogs own their keys), or while a picker/sheet is open. The event log ignores keys from portalled
  popovers opened from its rows. A focused control
  that owns a key wins (e.g. the event log's ↑/↓/Enter/Delete/R/E/T/N). Main keys: Space play/pause · G tag ·
  ←/→ ±5 s (Shift ±1 s) · ↑/↓ frame step · , . / speed · Home/End · [ ] previous/next file · Z/0 zoom · F fullscreen ·
  M mute · L event log · ? shortcuts · ⌘Z / ⇧⌘Z undo/redo. Keep `utils/shortcutList.ts` in sync when changing keys.

### Editor layout (calm editor, 2026-10-09)

- **Top bar:** wordmark · Files button ("4 files · 56:34", warning dot when a file needs attention; opens the Files
  sheet) · Setup · Export · ⋯ (all `.top-btn`; only Export is lime, and only once a video is loaded — before that Choose files is the one primary). Phone/landscape: Setup lives in ⋯. No file pills.
  Render progress shows on the Export button (red dot + % + thin line), then "Ready"/"Failed" for 4 s.
- **Video:** on-video `Scorebug` is the selected graphics theme's own score-bug painter drawn on a canvas (matches the export; clock as text beside it); no score in the top bar.
- **One timeline:** the match strip (`MatchStrip`) is the only scrubber (video.js progress bar disabled): numbered file
  bands, faint clip bands, event icons stacked in up to 3 lanes (`stackLanes`), Kick off / Half time / Final whistle
  flags, red playhead (touch/pen: icons never capture a press, so a drag always scrubs; only a short tap on an
  icon's own box jumps to it), hover/drag time bubble (over the exact symbol — event icon, marker flag icon, suggestion ring —
  it names it at its own time: "Goal · 10:00 · V2", "Found moment (top pick) · …"; no native `title` tooltips on
  icons), keyboard focusable.
- **Event icons:** `components/icons/EventIcon.tsx` + `utils/eventIcon.ts` (football, pen ball "P", own goal "OG",
  penalty spot / spot ✕, glove, whistle, star, flag, pause, chequered flag) — used in strip, rows, picker, edit sheet.
- **Rail tabs:** `Events | Matches` (`RailTabs`, `components/railTab.ts`, not persisted); opens on Matches when the
  editor is empty; L returns to Events. **Matches** (`MatchList`): + New match, rows newest first (title, score, date ·
  files, "Open"), ⋯ → Delete (Undo toast); unreadable records show "Couldn’t open this match". A reopened match shows
  the relink banner, naming the files to pick ("Pick GX010042.MP4, …"); in narrow rails "file missing" is the ⚠ alone.
- **Events rail:** rows = clock · team dot · icon · name (body font, weight 600, normal case — not the shirt face) ·
  note (inline, muted) · passive muted ↻ when the replay is on · score · ▶ (`utils/eventRow.ts`); no assist, no file
  number (only a "file missing" warning). The selected row expands into an action row (`EventActions`): Slow-mo replay
  switch shown as the ↻ icon beside the track (`role=switch`, aria-label "Slow-mo replay", R) · person-icon Edit · ⌖ Framing (when replay is on) · [Download clip slot] · × Delete;
  markers get Edit + Delete. Edit opens the event sheet's details (no replay toggle there); Framing opens only its
  "Replay framing" view (`editEvent(id, 'framing')`, `editingView`, not persisted; closes if the replay is switched
  off). All five fit one line on desktop; touch wraps 3 + 2 at rail widths 361–440px. Labels hide (icon-only) when the rail is ≤ 360px; the row wraps rather than clips. An expanded row scrolls the
  list (the page only when the list can't scroll, phone portrait); touch layouts keep room below the last row so the
  + never covers it. Touch: a tap expands (Edit opens the sheet). Esc collapses, then leaves the log.
  Header: "+ Tag event" (quiet, red REC dot), undo/redo, "?" shortcuts. No rail footer and no key-hint bar.
- **Export:** right-hand drawer over a scrim (`FloatingPanel variant="drawer"`; full screen on phones; a 480px side drawer on upright touch tablets 600–899px wide), tabs
  Highlights / Full match, one pattern: summary line (Highlights "6:12 reel · 14 clips" + Preview in player; Full match
  "49 min · kick-off to final whistle"), Quality (Original / 4K / 1080p with the size under each label; a short reason
  when disabled, full reason in `title`; "What's the difference?" toggles three one-liners), the tab's single lime button
  "Render highlights" / "Render full match" (+ " · 4K" / " · 1080p") with "About 418 MB · about 5 min[ on this device]"
  under it (`utils/renderSummary.ts`; time from the option's estimate, "on this device" only when measured here),
  "Preview with proxies" when proxies are loaded. Settings are collapsed `ExportDisclosure` rows (title + one-line
  summary, open state in localStorage): "Clips & replays", "Graphics", "Share on YouTube" / "Included", "Share on
  YouTube". The keep-screen-on line shows only while a render runs on a phone.
- **Share on YouTube** (both Export tabs): copy description / goalscorers, Make a thumbnail, and an "Open YouTube upload"
  link (youtube.com/upload in a new tab; no API, nothing sent until the user uploads there).
- **Shortcuts sheet:** `?` key, the "?" button or ⋯ → Shortcuts (`ShortcutsSheet`, data in `utils/shortcutList.ts`,
  kept in sync with `shortcutFor` by a test).
- **Find goals review card** (`SuggestionCard`, `ReviewTimeline`, `useMarkedMoment`, `PersonStep`, `utils/reviewMark.ts`):
  watch & mark (mini timeline over the loop window, default −5 s … +5 s: progress, red playhead, estimate ring, marked
  pin, +2 s end handles; M or the always-visible Mark moment button marks — Mark again once marked — and frame steps
  refine it; Space, speed keys and seeks never mark), then type, then team (never pre-selected), then optional scorer /
  assist / goalkeeper (`PersonStep`, shared with `EventPicker`: alphabetical, the scorer stays disabled in the assist
  list), then **Confirm** (Enter). **Discard** (X) is one press: not a moment, ring removed, moves on; undoable.
  ‹ Previous / Next › only move. Keys while open: M · G/O/S/H/X · 1/2 · Enter · Esc · [ ] previous/next suggestion ·
  { } loop 2 s earlier/later · ←/→ ±5 s (Shift ±1 s) · ↑/↓ frame · , . / speed · Space. No shortcuts fire while a
  person field is focused. On touch the person steps are name chips (alphabetical roster; `+ New name` is the only
  thing that opens a keyboard; Skip / No assist), Mark moment / Confirm + Discard are a sticky bar at the bottom, and
  the instruction line hides once marked. Lane buttons count suggestions still to review; the header stays positional
  ("2 of 5"). Specs: `2026-10-11-review-lanes-design.md`, `2026-10-11-review-actions-toasts-design.md`,
  `2026-10-13-mobile-review-fullscreen-design.md`.
- **Find goals card and summary (2026-10-13):** moment navigation is "Previous" / "Next" text buttons (the ‹ › pair is
  frame step); once marked, the instruction is screen-reader-only; the selected lane is neutral (Mark moment is the one
  lime); on phone landscape (max-height 500) the score sits in the panel header (`ColumnPanel` `headNote`). The start
  form opens with "Listens to the match on this device to find likely goals, then you check each one." The summary reads
  "You kept 4 of 6 · 3 were top picks."; the lane buttons hide there unless the goal-mouth check is still running; Copy
  diagnostics / Copy scores sit behind a "Details" toggle.
- **Find goals panel:** stays open while tagging (the picker opens on top; a tag inside the current loop confirms that
  suggestion) and returns after Setup / Export / event edit; only ✕/Esc closes it. Start form (`MatchRangeStep`) always
  shown first (Kick off / Final whistle pre-filled); with Labs on, **Advanced detection** runs the goal-mouth ball check
  (`startDetection({ ball })`, needs goals marked). Then two disjoint lanes in match order (`utils/reviewLanes.ts`):
  **Top picks** (lime star; ball seen in a goal mouth) and **Other moments**. Opens on Top picks while any are left;
  moves on to Other moments automatically only when the last top pick is decided; never jumps when tags arrive. Header
  tally "Goals tagged: Whites 3 – 2 Colours" (whole match). After closing, the rail shows "Review moments (N left ·
  M top picks)". Suggestion rings sit in their own faint lane at the bottom of the match strip (only those still to
  review; only a click on the ring opens the review).
- **Touch fullscreen** (UI state in `components/fullscreenUi.ts`, not persisted): column panels render into the
  fullscreen element; the tag box (`event-picker--compact`) and the review are a right-hand column (portrait: bottom
  sheet ≤ 60%); the top-right group (speed, **Lock playback**, **Review (N)**, exit) hides while the tag box is open.
  Lock: a single tap no longer plays/pauses (double-tap seek and the control bar still work); three toggling taps
  within 5 s glow the lock button once; reset on leaving fullscreen. Toasts render inside the player while fullscreen.
- **Words:** the feature is **Find goals** (panel title too), with an **AI** tag (`AiTag`: "Finds likely goals with AI
  on this device — check each one"); what it finds are **moments** ("Moment 1 of 4", "Review moments", "Found moment" on
  the strip); code identifiers keep `suggestion`. One **Beta** tag for the whole app sits right of the top-left wordmark.
  Editing is "Edit event"; labels say "highlights" (running text may say "reel").
- **Touch landscape:** on a tablet on its side the match strip sits directly under the picture (spare space below it);
  on a phone on its side the + sits on the picture's bottom-right, never over the rail. Match setup is two columns
  from 1024px wide.
- **Toasts** (`src/toasts.ts`, `Toast`): one at a time, 4 s, top-right of the video (phone portrait: under the video);
  confirm, discard (Undo), tag (Undo + "Add note" when it has none → edit sheet with the note focused), delete (Undo),
  marker set. A toast has an optional quiet `secondary` action.
- **Tagging on touch:** the optional note step is skipped (no keyboard); a Highlight's "What happened" step stays but
  doesn't autofocus (Done button). The picker dialog is named "Tag event" while tagging and "Edit event" when editing. A toast's Undo only acts while its action is still the
  latest undo step.
- **Lime guard:** `utils/limeUsage.test.ts` fails if a lime token is used in App.css outside the allow-list
  (primary buttons, goal icon, scorebug score). Don't widen the allow-list without a design decision.

## 8. How we work

### Specs, plans, notes
- Non-trivial work starts with a spec in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (decisions, scope,
  testing), optionally a plan in `docs/superpowers/plans/`. Record user decisions in the spec. Audits and the idea
  backlog live in `docs/superpowers/notes/`.

### Decisions log
- Record every product/technical decision in `DECISIONS.md` (repo root) in the same commit that acts on it: date, who
  decided (user / agent), the decision, **why**, and where the detail lives (spec section or commit). Newest first; when a
  decision changes, add a new entry naming the one it supersedes — never rewrite old entries. Specs keep the full design.

### Worktrees
- Every parallel or delegated piece of work gets its own worktree **inside this repo** under
  `.claude/worktrees/<short-name>` on its own branch — never sibling folders next to the repo.
  ```bash
  git worktree add .claude/worktrees/<name> -b <branch> main
  cp localhost+2*.pem .claude/worktrees/<name>/ && (cd .claude/worktrees/<name> && npm install)
  ```
- Each worktree has its own `node_modules` (~230 MB): remove it as soon as its branch is merged
  (`git worktree remove --force .claude/worktrees/<name>`; the branch stays). Check `git worktree list` first.
- All worktrees share `origin` (https://github.com/laurieainley/shooot.git). Only the main session merges to `main`
  and pushes.

### Tests (red → green)
- Write the failing test first, confirm it fails for the right reason, then implement. Never weaken a test to pass.
- Default Vitest environment is `node`; DOM tests add `// @vitest-environment happy-dom`. Tests live next to the code
  (`foo.ts` → `foo.test.ts`), `describe` per unit, `it('should …')`.
- Test utils and store logic directly; components for user-visible behaviour; the engine only via pure helpers and
  real renders. `site/api/*.test.js` run in the same Vitest suite.

### Before saying "done"
1. `npm run test:run`, `npx tsc -b --noEmit`, `npm run build`, `npm run lint` (no new problems) — and check the
   exit status, not just the summary line.
2. UI changes: screenshots at 390×844, 844×390, 834×1194, 1280×800, 1440×900 (+1920 for layout work), dark and light,
   touch emulation for phones/tablets — and actually look at them.
3. Render changes: real renders of generated media; `ffmpeg -v error -f null -` must print nothing; extract frames and
   look; for splices also check AVFoundation (QuickTime) decoding.
4. Report what was verified, what wasn't, and anything that needs a real device.

### Test media, disk, processes
- Generate small media with ffmpeg in the session scratchpad (≤ 30 s, 720p unless the test needs 4K/HEVC levels).
  Never search the user's home/Downloads/camera folders for videos. Delete media > 5 MB when done (the disk has filled
  up before).
- Dev servers on the port given in the brief (never 5174); stop every server/background command before finishing.
  Keep commands short with visible output; long jobs in the background writing to a log you poll.

### Commits
- Small, focused commits on a branch; merge to `main` with `--no-ff` after review. Commit messages end with the
  attribution trailers given in the brief/session.

## 9. Deploy and hosting

- **GitHub:** `laurieainley/shooot` (renamed from shot-stopper; old URLs redirect).
- **Vercel project `shooot`** (editor, repo root): deploys on push to `main`; skipped when only `site/` changed
  (`git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA:-HEAD^} HEAD -- . ':(exclude)site'`). Domains: editor.shooot.co.uk;
  shot-stopper.vercel.app → 308 to the editor.
- **Vercel project `shooot-site`** (root `site/`, no build): deploys only when `site/` changed. Domains: shooot.co.uk,
  www → 308 to apex. `site/api/waitlist.js` stores sign-ups in Neon Postgres (`DATABASE_URL`, sensitive) and
  optionally emails via Resend (`RESEND_API_KEY`, `WAITLIST_NOTIFY_TO`); IPs are stored only as salted hashes
  (`IP_HASH_SALT`).
- **DNS:** GoDaddy (A @ → Vercel, CNAME editor/www).
- Check deploys via GitHub commit statuses (`gh api repos/laurieainley/shooot/commits/<sha>/statuses`) or `vercel ls`.
- **Privacy:** the editor processes video locally; the only personal data collected is the waitlist (UK GDPR —
  `site/privacy.html`). Don't add analytics, tracking or third-party requests (incl. Google Fonts) without a decision.

## 10. Open items (keep this list short and current)

- `site/privacy.html` still has `{{CONTROLLER_NAME}}` / `{{CONTACT_EMAIL}}`; Resend notifications not configured.
- Hero demo video: storyboard draft in `docs/superpowers/specs/2026-10-09-demo-video-storyboard.md` (awaiting approval).
- History, voting and shared marking: draft design in `docs/superpowers/specs/2026-10-08-history-and-voting-design.md`
  (YouTube-embedded voting, editor-only history; WhatsApp-based voter verification under consideration).
- Needs real-device confirmation: 4K GoPro exports in QuickTime with graphics; background-tab rendering on desktop;
  iPad LRV picking; iOS replay preview volume.
