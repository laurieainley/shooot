# Decisions

A short log of product and technical decisions, with the reason for each. Newest first. Each entry gives the date,
who decided, the decision, why, and where the detail lives (spec or commit). When a decision changes, add a new
entry that names the one it supersedes, and mark the old one *Superseded*. Don't rewrite history.

Specs in `docs/superpowers/specs/` hold the full designs. This file is the index of *what was decided and why*.
Decisions made before 2026-10-11 are only in the specs' "Decisions" sections; they were not backfilled here.

---

## 2026-10-14

- **No general AI embedding model or video "judge" for Find goals; the audio score stays** (user's bar: "dropping multiple
  true positives would indicate they're not fit for purpose"; agent ran the test). On 413 labelled clips from 4 matches
  (69 goals; Colab A100), with 2 suggestions per goal, the audio score missed 4 goals. The best AI models did much worse:
  LCO-Omni-3B listening to sound only missed 9; EmbeddingGemma 2 (best mode) missed 13; Qwen3-VL-Embedding-2B and CLAP
  missed 14 each; PE-AV large (sound + video) missed 16; the Qwen3-VL-8B yes/no judge missed 21. Models that only see the
  video were near chance, because at fixed wide GoPro distance the ball and players are too small. Adding the 8B judge's
  score to the audio score cut misses from 4 to 2, but that weighting was tuned on the same goals.
  Device cost was not a factor (see the user's rule: accuracy first; downloads, runtime and a high-end phone are fine).
  The open route is a model trained on our own labelled footage. *Where:* spikes/clipbench (untracked):
  colab_results_1, colab_results_4, fusion.py.

- **Matches list keeps its own + New match only on phones** (user: yes). Desktop and tablet have it in the top bar, so the
  list's copy was a duplicate; phone layouts keep it (their top bar has New match only in ⋯). *Where:* fix/small-layout.
- **New match on short screens** (agent, user approved fixing): the step tabs stay pinned under the title bar while the
  form scrolls (max-height 560px), and every step opens at its top. In the narrow Find goals panel the lane switch drops
  its decorative list icon so "Other moments (3)" stays on one line. *Where:* fix/small-layout.

## 2026-10-13
- **One UI type scale, larger on desktop** (user: "the font is rather small generally"). Tokens `--sh-text-*` replace ad hoc
  12–13px sizes: body 15, labels/tabs 14, hints 13, panel titles 17; one step up (16/15/14/18) on screens ≥ 1600px with a
  mouse, since the user works full screen. Touch keeps its reviewed 14px pins. *Where:* feat/type-scale.
- **New match is a top-level button (left, after the logo); Files moves right beside Match setup** (user suggested;
  supersedes New match living only in ⋯ on desktop/tablet). Export follows the brand primary button (800 italic
  uppercase) like every other lime button (user: consistency). New match window is persistent (no outside-click or Esc
  close — Esc ignored rather than confirmed, so typed work can't be lost), all three steps show from the start, the Videos
  step reuses the Files list, rosters are a lineup with kit-colour shirts and counts (user). Goals copy states the two
  benefits separately (Find goals accuracy; replay zoom) (user). Matches list sorts (Last edited default) and "edited"
  means a real change, not opening a match (user). *Where:* merges of feat/newmatch-design, feat/topbar-matches.
- **UX round 3 (user approved):** Find goals card fits a phone on its side (score in the header), shows the marked time
  once, Previous/Next as text, neutral selected lane, and a one-line intro before the start form; the summary folds top
  picks into the kept line ("You kept 4 of 6 · 3 were top picks" — user preferred this over explaining what a top pick
  is), hides the lane buttons when nothing more can join them, and puts diagnostics behind Details; Download clip gets
  Cancel and "Downloaded: <name>"; New match swatches split 5 + 4 on phones (9 × 44px doesn't fit a 358px card).
  *Why:* the mocked review's proposals. *Where:* merges of feat/review-card, feat/clip-newmatch.
- **Share on YouTube gets an "Open YouTube upload" link, not an API integration** (user). *Why:* saves finding the upload
  page with no sign-in, Google app review or third-party requests; a full upload integration waits until posting to
  YouTube is common. *Where:* `src/components/YouTubeUpload.tsx`.
- **UX round 2 (user approved the layout and wording proposals):** the desktop action row fits one line, with the
  Slow-mo replay switch as a ↻ icon instead of text (user preferred an icon to widening the rail); on a tablet on its side
  the match strip sits right under the picture; on a phone on its side the + moves onto the picture; Match setup is two
  columns from 1024px and team names are no longer uppercase in its inputs; "Kick off" everywhere in copy; Export lengths
  in one format (m:ss / h:mm:ss); Files only in the top bar (out of ⋯); the double-tap warning names the earlier tag
  ("You tagged Goal 2 s before this…"). Agent fixes from the mocked review of the remaining flows: no key names on the
  touch Find goals card, Download clip disabled until videos are loaded, the phone top bar no longer overflows while a
  render runs. Bug: events of an unknown type are dropped/mapped on load instead of blanking the page (no persist
  version bump: a `merge` sanitises at any version). *Why:* the round-1 reviewers' proposals and the user's answers.
  *Where:* merges of feat/layout-wide, feat/copy-crash, feat/review-mocked.
- **"file missing" is a ⚠ alone in narrow rails (≤ 360 px)** (Claude). *Why:* in the phone-landscape rail the label and
  ▶ took 194 px and squeezed the event name to 0 px; reopened matches show it on every row. The label stays for screen
  readers and in the tooltip. *Where:* `EventLog.tsx` `FileSlot`, App.css `@container event-log`.
- **Match history: a Matches tab next to Events, autosaved to IndexedDB on this device** (user). The open match saves
  itself (no save/discard prompt; only a running render or Find goals asks before switching); Events | Matches are equal
  tabs in the rail; + New match keeps the old match in the list, so the Clear match confirmation goes; rows have Delete
  only (undoable). *Why:* the user wants to return to previous matches; autosave means switching never loses work, and
  a device-only store needs no server (the Postgres history in the 2026-10-08 draft stays parked). The open match id lives
  outside `vhm-state`, so no persist version is taken. *Where:* `docs/superpowers/specs/2026-10-13-match-history-design.md`.
- **Storage fit ignores a browser usage figure far above what the site stores** (Claude). *Why:* an iPad (Chrome = WebKit)
  reported 129 GB used of 154 GB while the site's file area held 0 GB and the whole Chrome app took 19 GB; believing it greys out 4K and
  Original for a full match. When `estimate().usage` exceeds the site's own files by more than 1 GB, the files are counted instead. If
  WebKit really enforced that figure, the render's storage-full message still explains it. *Where:* `src/render/storage.ts` (`USAGE_SLACK`).
- **UX review pass (desktop, phone, tablet) — polish only, no behaviour changes** (user asked for the review; agent
  decided the individual fixes). Export is quiet until a video is loaded (one lime per screen); Match setup's "Set up
  goals" is quiet so Done stays the one primary; touch text is restated at 14px at the end of App.css because later
  base rules overrode it; upright touch tablets get a 480px Export drawer instead of a full-screen page; the desktop
  action row wraps 3 + 2; key hints (K/W, ⌘Z) are dropped from copy on touch; sizes never show "0 MB"; the strip clock
  never shows "−00:00". *Why:* the reviewers found these against the brand rules (one lime, ≥14px on touch) and real use
  per device. Layout changes they proposed (wider rail on very wide screens, strip under the video on landscape tablets,
  + button placement in phone landscape, two-column Match setup) are parked for the user. *Where:* merge of
  feat/ux-desktop, feat/ux-mobile, feat/ux-tablet.
- **Re-encode exports (Full match and Highlights at 4K / 1080p) run 2 units at a time by default** (user, from /bench
  experiment #1). *Why:* on raw GoPro 4K, 2 at once was 37-38% faster on a Pixel, 28% (4K) / 6% (1080p) on an iPad and
  13-30% on Mac Chrome, with frame counts and gaps intact. 3 at once gained little more on the Pixel and grew iPad files
  36% (18% at 2), so 2 is the cap. Journaled renders only; the stream-copy Original path is untouched. If a unit fails
  while another is running (e.g. no second hardware encoder) the render drops to one at a time and retries that unit;
  parallelism never fails an export. Estimates use per-device factors (Android 0.63, iPad 0.94 / 0.72, desktop 0.8);
  learned rates are measured against that adjusted model and old re-encode rates are ignored so the speed-up is counted
  once. Highlights re-encodes are journaled too, with one saved job (IndexedDB key and OPFS folder) per kind so a reel never discards a half-finished full match; an old single job migrates to its kind. *Where:* `render/renderJob.ts`, `render/unitPool.ts`, `transcodeEngine.ts`, `utils/renderTime.ts` (`parallelFactor`).

- **Re-encode exports reuse the parts of the last export that no edit touched** (user, from /bench experiment #2; real devices re-rendering a
  51 s reel after one caption change: Pixel 65% faster, iPad 58%, Mac ~60%, output checks passed). *What:* Highlights and Full match at
  4K / 1080p keep each finished unit (title card, a stretch of one cut, full-time card) in OPFS (`unit-cache/`, packet log + a small json)
  and the next export of that kind copies matching units back instead of encoding them; the rest still render 2 at a time. Not for Original
  (stream copy), previews or clips. *Keys:* a SHA-256 of everything that decides the unit: footage identity (name, size, modified time),
  the cut (times, speed, crop, gain, silence), output quality and bitrate, the engine's size / frame rate / key-frame interval / encoder
  (hardware or software, full config) / scale path / audio format, the unit's frame range inside its cut, the graphics drawn in it (the
  overlays overlapping the unit, the theme, the card spec, the logo's hash, a replay's previous clip when its caption carries on, and what
  the prepared graphics will really draw) and `RENDER_VERSION` (bump it when the engine, painters, themes or fonts change what a frame looks like).
  The full-time card's key includes its scorers. The unit's place on the output timeline is deliberately NOT in the key: timestamps are
  stored relative to the unit and moved back onto the frame grid on reuse, so trimming goal 1 does not invalidate goal 3. Key frames are
  placed relative to the cut, never the output, so they do not depend on where the unit lands. A wrong reuse is far worse than a miss: anything
  unsure is in the key, and any read problem (missing, wrong size, damaged mid-stream) is a miss that renders the unit normally.
  *Unit boundaries:* with the cache on, `planSegments` runs in `stable` mode: every cut is cut into 2-minute pieces from its own first frame
  (a tail under 10 s joins the piece before), so a cut's units never depend on the other cuts, and editing one goal moves no other goal's units;
  the old balanced split (equal pieces per cut) would shift all of a long cut's units when its end is trimmed. A render with fewer than 2 units
  still falls back to the balanced split so two can run side by side. A highlights reel is one unit per clip, which is also the cache's
  granularity for captions (a replay re-renders with the clip whose caption it carries on; the full-time card re-renders whenever scorers change).
  *Storage:* the cache holds only the last export of each kind (everything else is deleted when an export finishes) and is capped at the
  smaller of 6 GB and a quarter of the site's quota, oldest export first. Units are kept only while the render still has room (about
  1.3x its output free after a unit is copied in; on a phone a long Full match mostly will not be cached). `storageRoom()` counts the
  cache as free room, and the engine evicts cached units (the ones about to be reused last) before an export would run short; a quota
  error also clears the cache and the message says so. `clearSavedParts()` (storage.ts) deletes it. *Estimates:* the Export panel asks the
  cache which whole cuts / cards survive from the last export (`reusableParts`, cheap: manifest + one listing) and counts them out of the time
  hint; the engine prices reused units out of its first `estimateSec`, the progress and the ETA. A run that reused anything does not feed the
  learned device rates (it would teach a fast device). The progress shows "Reused 6 of 9 parts from your last export". The bench can turn it
  off with `experiments.unitCache = false`. *Where:* `render/unitCache.ts`, `transcodeEngine.ts` (`restoreUnit` / `keepUnit`), `render/storage.ts`, `utils/renderTime.ts` (`reusedSeconds`), `components/renderRequest.ts` (`reuseKeysFor`), `components/useReusableParts.ts`.

- **Goal set-up is a guided full-screen flow** (user). Choose the picture from 6 frames (avoid a player covering a goal)
  → Identify goal posts per goal (touch: move the picture under a crosshair, Set point) → Replay zoom per goal with the
  replay view as the editor → summary. Each goal is named by the team that defends it at kick-off; "attacking" is
  never used. *Why:* marking posts was "pretty impossible on mobile" and the old boxes didn't say whose goal was whose.
  *Where:* `docs/superpowers/specs/2026-10-13-guided-goal-setup-design.md`, `src/components/goalSetup/`.
- **Find goals has one vocabulary and an AI tag; Beta moves to the app** (user). Feature and panel "Find goals",
  results "moments" ("Review moments", "Found moment"), an "AI" tag instead of "Beta" on Find goals, one Beta tag by the
  logo. "Highlights" in labels; "reel" is fine in running text for variety. *Why:* four names for one feature, and Beta
  applies to the whole product. *Where:* `src/components/AiTag.tsx`, top bar, `SuggestionReview`, `MatchStrip`.
- **Export drawer: render first, size and one time on one line, settings collapsed, one vocabulary** (user). Buttons
  "Render highlights" / "Render full match" (was "Render MP4" / "Render full match (full quality)"), "Preview with
  proxies" on both tabs, tabs "Highlights" / "Full match". *Why:* the section was "way too much text", sizes were unclear,
  and the two tabs used different words for the same action. *Where:* `src/components/ExportPanel.tsx`,
  `OutputQualityField.tsx`, `ExportDisclosure.tsx`, `src/utils/renderSummary.ts`.
- **Render time comes from a cost model of what the render does, and the live ETA from work-weighted progress** (user bug:
  a phone said Original ~10-13 min for a 6 min reel and "about 2 min left" after 2 minutes). Fixed multipliers measured on raw GoPro
  4K ignored the ticked options, the footage and the device, and media-time progress counted a copied second like a re-encoded one.
  Now: per-device-class coefficients fitted to the benchmarks (every measurement within 25%, two Pixel outliers within 40%);
  engines report progress as a share of estimated work; the ETA blends the model total with observation; finished renders teach the
  model this device's ratio per path (localStorage). Unknown devices use the slowest set. *Where:* `src/utils/renderTime.ts`,
  `renderEta.ts`, `render/mediabunnyEngine.ts`, `render/transcodeEngine.ts`, branch `feat/render-time`.
- **On touch, the optional note step after tagging is skipped; the tag toast offers "Add note"** (user). Highlights keep
  "What happened" but without opening the keyboard. Desktop unchanged. *Why:* the note field popped the keyboard and
  shifted the layout for something optional. *Where:* `src/utils/eventPicker.ts` (`touch` in the context),
  `src/components/EventPicker.tsx`, `src/toasts.ts` `secondary`.
- **Editing is called "Edit event" everywhere** (user); the picker reads "Tag event" while tagging.
- **Preview: zoom locked, row ▶ jumps to that clip inside the preview, no speed overlay** (user). *Why:* the preview
  should show exactly what renders, and jumping around it shouldn't drop you out of it. *Where:* `src/utils/preview.ts`,
  `src/state.ts` `jumpToPreviewEvent`, `src/components/Player.tsx`.
- **Mobile review and fullscreen tagging reworked for one thumb** (user). Lane buttons count what's left. On touch:
  name chips instead of typing (keyboard only for a new name), a sticky Confirm / Discard bar, compact type/team rows,
  less text. The fullscreen tag box and the review are a right-hand column (bottom sheet in portrait), with a
  "Review (N)" button in fullscreen. Desktop keeps typed names. *Why:* on a phone the tag box was cut off, the assist
  field couldn't be seen, the review needed scrolling for every step, and fullscreen is the natural way to review on a
  phone. *Where:* `2026-10-13-mobile-review-fullscreen-design.md`.
- **Playback lock in touch fullscreen** (user). Single taps stop toggling playback; double-tap seek still works; three
  toggling taps in 5 s glow the lock button as a hint. Not persisted, reset on leaving fullscreen. *Why:* single taps
  were pausing the video while editing.
- **Touch scrubbing no longer snaps to goals** (user). With touch / pen, icons don't capture the press, so a drag
  always scrubs; only a short tap on the icon itself jumps. Marker flags were never tap targets and stay that way.
  *Why:* starting a drag anywhere near an icon jumped to the goal, so accurate scrubbing was hard.
- **The fullscreen top-right buttons hide while the tag box is open** (Claude, review). *Why:* the column would cover
  them; the tag box has its own Cancel.

## 2026-10-13
- **Added `RenderExperiments.scaler: 'webgpu'` (default off) and bench experiment 11; the iPad/Pixel/Mac presets now run only #11.**
  *Why:* device runs show the re-encode splitting into decode wait, paint/scale (Pixel 29 s of 131 s, iPad 18.5 s of 43 s) and encoder
  back-pressure; we want to know if one WebGPU pass (zero-copy video import, scale + overlay composite) cuts paint/scale. The other
  experiments are done, so the presets are narrowed to avoid re-running them. *Where:* `src/render/gpuScaler.ts`, `src/bench/experiments/webgpu.ts`,
  `src/bench/presets.ts`. Not used by the editor; decide after the device numbers.
- **WebGPU stays bench-only: not used for real exports on any device** (user + Claude). *Why:* device numbers (45 s GoPro 4K, 2 units
  at a time): Pixel 5–10% faster overall (scale + paint 8.7 → 1.3 ms/frame, but the encoder is the limit), colour correct; iPad about
  2× slower (it replaces encoder scaling, which is nearly free there) and the adapter vanished mid-run; Intel Mac no gain and a +9/255
  washed-out picture. A few percent on one device class doesn't justify a second picture path, a colour self-check and device-loss
  handling while browser support is patchy. Experiment 11 stays on /bench to re-test later.

## 2026-10-12

- **Roster entry: Enter adds the name and stays in the field; names sit below the field; this device remembers
  players and suggests them** (user). One remembered list for both teams (teams are reshuffled weekly), up to 6
  suggestions while typing (most recent first; with an empty field, recent players not in a team), × forgets one. Device
  data only (not in projects or links). *Why:* on phones Enter jumped to the next field, and names inside the box were
  hard to scan; retyping the same players every week is slow. *Where:* `src/components/RosterTags.tsx`,
  `src/utils/knownPlayers.ts`, persist v26.
- **Event action row: slow-mo replay is a labelled switch; Edit and Framing open separate views** (user). Order:
  Slow-mo replay switch · Edit · Framing (replay on) · Download clip · Delete; a muted ↻ on the main row shows a replay
  is on; the edit sheet's duplicate replay toggle is gone. *Why:* "Replay" read as a button to more settings, not an
  on/off state, and Edit showed framing the user didn't ask for. *Where:* `src/components/EventActions.tsx`,
  `EventSheet.tsx`, branch `feat/action-row-replay-switch`.
- **Clip file names never include the score** (user: "don't need score in filename either way"). `Matchday 3 - Hawks v
  Lions - 13' Goal DJ.mp4`. Highlights and full-match names keep the score. *Why:* a shared clip shouldn't spoil the
  result. *Where:* `src/utils/outputName.ts`.
- **After a finished clip, Download again is the primary button; Render again is quiet** (user). *Why:* the lime
  Download next to Download again started a second render by mistake. *Where:* `src/components/ClipDownload.tsx`.
- **Leaving the page asks first while Find goals is running, as it already did for renders** (user). *Why:* a closed
  tab loses the run; the ball check alone takes about 10 minutes. *Where:* `src/components/useLeaveWarning.ts`.
- **On touch, one finger pans the video while zoomed in; two fingers still pinch and pan** (user). *Why:* two fingers
  cover more of the picture. At 1× one finger does nothing new (taps and page scrolling are unchanged), and a tap
  without movement still plays / pauses. *Where:* `src/components/pictureGestures.ts`.
- **Optional known final score in New match and Match setup; Find goals says how many goals are left** (user). One
  optional scoreline under the team cards (not a separate step). The gap shows only where goals are found: the Find goals
  tally ("3 to find", "✓ All goals tagged", or "N more than the final score"), the review summary, a one-off "All N goals
  tagged" toast, and a quiet Export note. Graphics and file names keep the tagged score. The New match wizard drops
  league logo and graphics style (still in Match setup / Export). *Why:* knowing the real result tells the reviewer when
  every goal is found and how many are missing, without adding a third score to the editor. *Where:*
  `docs/superpowers/specs/2026-10-12-known-final-score-design.md`, branch `feat/known-final-score`.
- **The match strip's hover bubble names the symbol under the pointer** (user). Over an event icon, a marker's flag icon
  (not its hairline) or a suggestion ring, the bubble reads e.g. "Goal · 10:00 · V2" or "Detected moment · …", at the
  symbol's own time. Anywhere else it shows the time as before. Native `title` tooltips on icons were removed, so two
  popups don't show at once. Suggestion rings are called "Detected moment" (they were "Suggested moment"). *Why:*
  clarity about what each mark on the timeline is, without the bubble changing as you scrub. *Where:*
  `src/components/MatchStrip.tsx`.
- **Find goals review loop defaults to −5 s … +5 s** (user). Supersedes −5 … +4 and earlier entries below.
  *Why:* the 03-09 goal at 28:14 had a crowd reaction ~11 s late. Across 51 real goals, −5 … +4 covered 37 and
  −9 … +6 would cover 47, but the user hadn't needed more lead-in when watching highlights, so they chose the smaller
  window. The { } keys extend it by 2 s when needed. *Where:* `src/detect/detectConfig.ts` `reviewWindowSec`,
  commit e398ff3.

## 2026-10-11

### Find goals: detection
- **The ball check uses stock COCO RF-DETR-nano (sports ball), not fine-tuned** (Claude, user aware). *Why:* it ships
  licence-clean and works now. Fine-tuning comes later, once real-match recall is measured. *Where:*
  `2026-10-11-ball-check-design.md`.
- **Balls already resting in a goal are ignored** (user agreed). Look-back samples are taken at t−20 s and t−12 s, and
  a detection within ±12 px of a look-back detection doesn't count. *Why:* on the 24-09 and 29-09 matches a spare ball
  sat in a goal for minutes and tagged the wrong goal. The share of ball tags that were real goals went from 17/35 to 12/19. *Where:*
  ball-check spec, "2026-10-11 change".
- **The ball check never picks the team** (user). *Why:* the ball-in-goal → team mapping was wrong too often (resting
  balls, end swaps), and a wrong preselection is worse than none. The reviewer chooses. *Where:* ball-check spec.
- **The ball model loads when Find goals starts, with visible download progress** (user). *Why:* loading it lazily
  after the audio pass meant a deploy in between had already removed the old chunk, so stale-build recovery reloaded
  the page ("Ball check failed" and then a refresh). There was also no progress during the ~10 s download. *Where:*
  commit 9f89f5f.
- **ONNX Runtime logs at error level only** (Claude). *Why:* the constant_folding warnings the user saw in the
  console are harmless noise.
- **No incremental audio results** (user). *Why:* the audio pass takes about a minute, so it's fine to wait for it.
  *Where:* `2026-10-11-review-lanes-design.md`.
- **Advanced detection is a tick box on the start form, behind Labs** (user). *Why:* the ball check is slow (about
  10 min per hour of 4K) and experimental, so it should be an explicit choice rather than implied. *Where:* lanes spec §B.
- **The detection range comes from the Kick off / Final whistle markers** (user asked; already the case). The start
  form is always shown, pre-filled.

### Find goals: review UX
- **Lanes are "Top picks" and "Other moments", disjoint, Top picks on the left** (user). Supersedes "On target" (it
  implies a shot on target) and "All" (it overlapped Top picks). *Where:* `2026-10-11-review-actions-toasts-design.md`
  addendum 3.
- **Keep chronology: the review never jumps around on its own** (user). *Why:* being thrown halfway along to a strong
  suggestion is disorienting. Each lane is in match order, and new tags only update counts. The single exception: once
  the last top pick is decided, the review moves on to Other moments, with a toast. *Where:* toasts spec addendum 3.
- **The review opens on Top picks while any are left** (user). Supersedes "default lane All" in the lanes spec.
- **Space only plays/pauses. Only M, the Mark moment button and frame steps mark** (user). *Why:* pausing to look was
  also marking the moment. *Where:* lanes spec §A.
- **The mark control is always on the card ("Mark again" in place)** (user). *Why:* editing and re-marking was a
  needless second step.
- **Previous/Next only move. Discard (X) is one press and moves on. Confirm (Enter). Skip removed** (user). *Why:*
  moving and deciding were mixed up. *Where:* toasts spec "Decisions".
- **Toasts for confirm, discard, tag, delete and markers, one at a time, with Undo** (user). They sit top-right of the
  video on desktop and under the video on phone portrait. Undo only acts while its action is still the latest undo step
  (review finding I3: otherwise Undo would undo something else). *Where:* toasts spec.
- **The review stays open until explicitly closed, and the rail offers "Review suggestions (N left · M top picks)"**
  (user). *Why:* tagging from the editor was dropping the user out of the review. *Where:* toasts spec addendum 1.
- **Keys: [ ] previous/next suggestion, ←/→ ±5 s as in the editor, { } extend the loop by 2 s** (user). *Why:* the
  arrows mean seek everywhere else. *Where:* addenda 2 and 5.
- **No Top pick tag on the card. A lime star and a lime selected segment for Top picks** (user). This is an approved
  exception to the lime guard. *Where:* addendum 2.
- **Scorer, assist and goalkeeper on the review card, shared with the event picker** (user). The list is alphabetical,
  and the scorer stays in the assist list but disabled. *Why:* someone using Find goals to tag the whole match should be
  able to name players there too. *Where:* addendum 3.
- **Goals tally in the review panel ("Goals tagged: Whites 3 – 2 Colours")** (user). *Why:* it's useful to see how many
  goals have been found, especially when checking against a known final score. *Where:* addendum 4.
- **Suggestion rings get their own faint lane on the match strip, and only a click on the ring opens the review**
  (user). *Why:* clicking the timeline near a ring was pulling the user into the review, and suggestions were blurring
  with real goals. *Where:* addendum 5.

### Superseded
- *Superseded 2026-10-12:* review loop −5 s … +4 s (commit 0d95a82, from the user's "suggestions are a bit short — add
  another 2 s to the end"), and before that −5 … +2 (70d2970) and −3 … +2.
- *Superseded 2026-10-11:* lane names "On target" and "All"; default lane All; the ball hint text on the card; team
  preselected from the ball tag; "Not a goal" + Enter; Skip.
