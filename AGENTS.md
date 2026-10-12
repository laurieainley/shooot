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
  teams but never the score (`Matchday 3 - Hawks v Lions - 13' Goal DJ.mp4`). After a finished clip the popover's
  primary button is Download again; Render again is quiet. Job kind `'clip'`: never resumable, doesn't save a timeline or the last diagnostics report;
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
  frame is encoded (no second pass). 4K is disabled for sources below 4K; either option is disabled with a reason when
  `VideoDecoder`/`VideoEncoder.isConfigSupported` says no. Audio: AAC is copied, anything else is encoded to AAC at 160 kbps.
  Resumable: units are the cards and ≤ 2-minute segments of output, each with its own encoder and a key frame at its
  start (an interruption loses at most the unit in progress); the output quality is part of the job signature.
  **Storage fit and time:** `applyStorageFit()` (utils/outputQuality.ts) greys out options bigger than the site's free
  storage (`storageRoom()` in render/storage.ts: quota − usage + old outputs `clearOldOutputs()` frees, 10% margin) and
  auto-picks the largest that fits; no `estimate()` means no blocking. Time hints are device-range ranges; the running
  render shows a live ETA (`utils/renderEta.ts`, moving average of progress per second) in `RenderStatus`.
- **Highlights output quality** (`highlightsQuality` in the store, persist v24; `'auto'` = the device default, any other value is the
  user's explicit choice and sticks): the same Original / 4K / 1080p choice as Full match, via the shared `OutputQualityField`
  (segmented control) in `RenderHighlights`, the same option list (`qualityOptions`), availability rules (`useReencodeSupport`), size and
  time hints and `applyStorageFit` grey-out/auto-pick (the old warning-only `highlightsRoomWarning` is gone). `highlightsExport(state,
  'full', planOutput(q))` puts the output in the job signature; `RenderOptions.output` sends the whole reel (clips, replays, slow-mo,
  cards, captions, score bug, replay tag, sting) through `transcodeEngine` in one pass. Re-encoded cuts are frame-exact (no GOP snapping),
  so `onTimeline` chapters are exact; estimates for re-encoded reels have no key-frame slack (`DescriptionArgs.reencoded`). Defaults:
  Original on desktop/tablet; 1080p on a phone layout (`phone` or landscape phone; `resolveHighlightsQuality`) because on a Pixel Original
  is slowest (2.2x the reel: its replays/graphics are re-encoded HEVC 4K) vs 1080p ~1.0x, 4K ~1.25x; iPad Original 0.4x, 4K 0.84x; Mac
  Chrome Original ~0.5x, 1080p 0.7x, 4K 0.9x (`HIGHLIGHTS_ORIGINAL_TIME`). Time hints are "for a N min reel". Highlights are not resumable.
  The plan is memoised from a shallow selector without the playhead, so the panel does not re-plan while the video plays.
- **Chapters:** YouTube chapter times come from the real render timeline (engine `onTimeline` → `renderTimelines.ts`,
  matched by plan signature); until then an estimate from the render plan, flagged in the UI.
- **Render storage:** outputs are written to OPFS first; `clearOldOutputs()` deletes earlier renders before each
  render (the per-site quota filled up otherwise); a quota error gets a plain message (`render/storage.ts`).
- **Goal areas:** per team (`team1`/`team2`), drawn in Match setup; `replayGoalFor()` picks the replay crop.
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
- **Deploys while a tab is open:** stale lazy chunks are recovered by one guarded reload (`staleBuildRecovery.ts`);
  the render engine is warmed at idle.
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
  - touch targets ≥ 44 px, text ≥ 14 px on touch, contrast ≥ 4.5:1 (`node scripts/check-contrast.mjs`), respect
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
  sheet) · Setup · Export · ⋯ (all `.top-btn`; only Export is lime). Phone/landscape: Setup lives in ⋯. No file pills.
  Render progress shows on the Export button (red dot + % + thin line), then "Ready"/"Failed" for 4 s.
- **Video:** on-video `Scorebug` is the selected graphics theme's own score-bug painter drawn on a canvas (matches the export; clock as text beside it); no score in the top bar.
- **One timeline:** the match strip (`MatchStrip`) is the only scrubber (video.js progress bar disabled): numbered file
  bands, faint clip bands, event icons stacked in up to 3 lanes (`stackLanes`), Kick off / Half time / Final whistle
  flags, red playhead, hover/drag time bubble (over the exact symbol — event icon, marker flag icon, suggestion ring —
  it names it at its own time: "Goal · 10:00 · V2", "Detected moment (top pick) · …"; no native `title` tooltips on
  icons), keyboard focusable.
- **Event icons:** `components/icons/EventIcon.tsx` + `utils/eventIcon.ts` (football, pen ball "P", own goal "OG",
  penalty spot / spot ✕, glove, whistle, star, flag, pause, chequered flag) — used in strip, rows, picker, edit sheet.
- **Events rail:** rows = clock · team dot · icon · name (body font, weight 600, normal case — not the shirt face) ·
  note (inline, muted) · passive muted ↻ when the replay is on · score · ▶ (`utils/eventRow.ts`); no assist, no file
  number (only a "file missing" warning). The selected row expands into an action row (`EventActions`): Slow-mo replay
  switch (`role=switch`, R) · person-icon Edit · ⌖ Framing (when replay is on) · [Download clip slot] · × Delete;
  markers get Edit + Delete. Edit opens the event sheet's details (no replay toggle there); Framing opens only its
  "Replay framing" view (`editEvent(id, 'framing')`, `editingView`, not persisted; closes if the replay is switched
  off). Labels hide (icon-only) when the rail is ≤ 360px; the row wraps rather than clips. An expanded row scrolls the
  list (the page only when the list can't scroll, phone portrait); touch layouts keep room below the last row so the
  + never covers it. Touch: a tap expands (Edit opens the sheet). Esc collapses, then leaves the log.
  Header: "+ Tag event" (quiet, red REC dot), undo/redo, "?" shortcuts. No rail footer and no key-hint bar.
- **Export:** right-hand drawer over a scrim (`FloatingPanel variant="drawer"`; full screen on phones). Highlights tab:
  Reel (`ReelSummary`: length, clips, clip/replay recap with an Edit disclosure), Graphics, Render, Share.
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
  person field is focused. Specs: `2026-10-11-review-lanes-design.md`, `2026-10-11-review-actions-toasts-design.md`.
- **Find goals panel:** stays open while tagging (the picker opens on top; a tag inside the current loop confirms that
  suggestion) and returns after Setup / Export / event edit; only ✕/Esc closes it. Start form (`MatchRangeStep`) always
  shown first (Kick off / Final whistle pre-filled); with Labs on, **Advanced detection** runs the goal-mouth ball check
  (`startDetection({ ball })`, needs goals marked). Then two disjoint lanes in match order (`utils/reviewLanes.ts`):
  **Top picks** (lime star; ball seen in a goal mouth) and **Other moments**. Opens on Top picks while any are left;
  moves on to Other moments automatically only when the last top pick is decided; never jumps when tags arrive. Header
  tally "Goals tagged: Whites 3 – 2 Colours" (whole match). After closing, the rail shows "Review suggestions (N left ·
  M top picks)". Suggestion rings sit in their own faint lane at the bottom of the match strip (only those still to
  review; only a click on the ring opens the review).
- **Toasts** (`src/toasts.ts`, `Toast`): one at a time, 4 s, top-right of the video (phone portrait: under the video);
  confirm, discard (Undo), tag (Undo), delete (Undo), marker set. A toast's Undo only acts while its action is still the
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
