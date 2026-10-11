# Suggested goals — design (C: audio suggestions + review)

Status: draft for review · 2026-10-11

## Why

Tagging an hour of footage is the slowest part of using Shooot. Spikes on six indoor matches (QMSC hall, `spikes/goal-detect`,
`spikes/yolo-test`, git-ignored) showed that the match audio alone — a voice-band
burst followed by a hush — puts about 70–75% of goals into a shortlist twice the length of the goal count, with no model,
no setup and no licence questions. Ball-in-goal detection (a fine-tuned detector on the near-goal area) confirms goals
precisely but needs goal marking and a licence-clean model.

## The three pieces and their order (decided)

| | Piece | Depends on | Status |
|---|---|---|---|
| **C** | Suggested goals from audio + quick review + summary | nothing | **this spec** |
| **A** | Goal marking: posts, crossbar, back corners per goal in Match setup; replay zoom box derived from them | — | later spec |
| **B** | Ball detection engine: frame sampling around suggestions, ONNX model on WebGPU in a worker, ball-in-goal rules | A, a licence-clean model | later spec |

Order: **C → A → B** (user decision). B adds suggestions with `source: 'ball'` and boosts audio suggestions it confirms;
the review UI from C is reused unchanged.

## Decisions recorded

- Runs in the browser, on the device. No upload. A native/desktop app is reconsidered only after B is measured in the browser.
- The B engine is model-agnostic (any ONNX detector). The AGPL Ultralytics model is never shipped publicly; B stays off on
  the public site until a licence-clean model (RF-DETR / D-FINE / YOLOX / MIT YOLOv9 under test) is chosen.
- C ships to **everyone** on the live site, labelled **Beta**.
- Review is a fast triage with a summary ("You kept 6 of 22") that doubles as a health check of detection on that footage.
- User-trained detection and VLM (e.g. Gemini) pre-filling of goal marks are out of scope for now.

## C — user flow

1. **Start:** ⋯ menu → **Find goals** `Beta`; also offered in the events rail empty state. Needs at least one loaded file.
   If Kick off / Final whistle markers exist, only that span is analysed (warm-up and post-match chat are skipped).
   If suggestions already exist, the menu item reads **Review suggestions** (plus **Find goals again**, which replaces
   pending suggestions but keeps decisions already made).
2. **Analysis:** a background job, like a render: progress in the review sheet ("Listening for the roar… 40%" — brand voice
   for progress only), cancellable, keeps running if the sheet is closed. Audio only, so well under a minute for an hour of
   GoPro footage on a laptop (to be measured).
3. **Quick review** (sheet over the player; full screen on phones): "Suggestion 3 of 30". The main player seeks to and loops
   **−5 s → +2 s** around the moment (user decision); "−2 s" / "+2 s" buttons (keys `[` `]`) extend it, resetting per suggestion.
   - Keys: **G** goal · **O** own goal · **S** save · **H** highlight · **X** not a goal · **←/→** previous / skip ·
     **Esc** closes (progress kept). After **G** or **O**, **1 / 2** chooses the team (team names shown); Enter
     confirms with the first team (or a pre-selected one); the button also confirms. Scorer/assist are added later via normal editing.
   - Touch: the same actions as buttons ≥ 44 px. Only **Goal** is lime; others are quiet buttons.
   - Keeping a suggestion creates a normal event (undoable) at the suggestion time **− 2 s** (the shout follows the goal),
     linked to its file like any tagged event.
4. **Summary** when all are reviewed (or on close): "You kept 6 of 22." If under 15% were kept: plain note "Detection
   struggled on this footage. Copy diagnostics and send it over." Kept moments are already in the events rail.
5. **Match strip:** pending suggestions show as small hollow chalk rings (brand: open rings = not a goal (yet)); they
   disappear once reviewed. Clicking one opens the review at that suggestion.

## C — engine

- `src/detect/audioSource.ts` — decodes each file's first audio track with Mediabunny (`AudioSampleSink`) reading through
  `render/fileSource.ts` (never `BlobSource`), downmixed to mono and resampled to 16 kHz. Files without audio contribute
  silence (no suggestions there).
- `src/utils/goalAudioScore.ts` (pure, fully unit-tested) — from PCM: 0.2 s frames → loudness (dB) and voice-band
  (300–3000 Hz) energy → 1 s smoothing → robust z-scores against the match's own median/MAD →
  `score(t) = max(voice, t−3…t+3 s) − mean(loudness, t+5…t+15 s)` → top-N with a minimum gap. Same maths as
  `spikes/goal-detect/transfer/audio_rank.py`.
- `src/detect/detectConfig.ts` — all tunables in one object, with a `version` recorded on each run:
  `{ hopSec: 0.2, smoothSec: 1, voiceHz: [300, 3000], peakWindowSec: [-3, 3], hushWindowSec: [5, 15], minGapSec: 20,
  maxPerHour: 45 (count = clamp(round(45 × analysed hours), 10, 60)), eventOffsetSec: -2, reviewWindowSec: [-5, 2] }`.
- `src/detect/audioWorker.ts` — the spectrum and scoring run in a Web Worker (PCM chunks are transferred, not copied);
  decoding stays on the main thread via Mediabunny, yielding with `render/yield.ts` (`waitForQueue`), never timers.
- `src/detectJobs.ts` — one detection job at a time, outside the UI (pattern of `renderJobs.ts`): phase, fraction,
  status, cancel, error. Holds the screen wake lock while running. No OPFS journal (a re-run is cheap).
- Multi-file timelines: per-file scores are placed on the whole timeline with `computeCumulativeOffsets()`; the
  minimum-gap selection runs on the joined timeline.

## C — data

```ts
type SuggestionStatus = 'pending' | 'kept' | 'rejected'
type Suggestion = {
    id: string
    globalTimeSec: number          // on the whole timeline
    score: number
    source: 'audio'                // 'ball' added by B
    status: SuggestionStatus
    keptAs?: EventType             // goal | own_goal | save | highlight
    eventId?: string               // the event created when kept
}
type SuggestionRun = { createdAt: number; source: 'audio'; configVersion: number; analysedSec: number; total: number }
```

- Store: `suggestions: Suggestion[]`, `suggestionRun: SuggestionRun | null`, actions `setSuggestions`, `keepSuggestion`
  (creates the event and marks kept in one undo step), `rejectSuggestion`, `clearSuggestions`.
- Persisted in `vhm-state`: **version 16 → 17**, migration defaults both to empty/null; test included.
- Not included in project export/import or transfer links in this version (keeps links short).
- Clearing all files or loading another project clears suggestions.
- Each run records its file keys; if the videos change afterwards the old suggestions are hidden and Find goals is offered again.
- Diagnostics (Copy diagnostics): run time (`durationMs` on the run), config version, analysed seconds, suggestions total / kept by type / rejected.
  No audio or timestamps beyond those counts.

## Testing

- Unit (`goalAudioScore.test.ts`): synthetic PCM with a voice-band burst then a hush ranks first; steady crowd noise does
  not; minimum gap respected; top-N cap; robust normalisation invariant to overall gain; multi-file offsets.
- Store: migration 16→17; keep creates the right event type/team/time and is one undo step; reject; re-run keeps decisions.
- Components (happy-dom): review keys and team choice, button labels, summary copy and the low-keep note, Beta label,
  hollow rings on the strip, menu item states. `src/detect` is mocked at the component boundary.
- Real footage: a dev-only **Copy scores** action exports the score timeline; compared against the Python spike on the
  six test matches (target: same ~70–75% of goals within a 2× shortlist; per-match numbers recorded in the PR).
  Then a real-device check on a laptop and a phone (iOS Safari and Android Chrome), reported as verified/unverified.
- Usual gates: tests, `tsc -b`, build, lint baseline, screenshots at the five sizes in dark and light.

## Out of scope (C)

Ball detection, goal marking changes, export of suggestions in projects/links, per-user tuning, cloud verification,
outdoor-specific tuning (first outdoor test planned with Battersea Powerleague footage after C ships).

## Open risks

- Outdoor footage (wind, no walls, distant voices) may weaken the audio signal; C's summary note is the early warning.
- Matches where goals come seconds apart (QMSC 47:18 / 47:28) can't all get their own suggestion with a 20 s gap.
- Decoding audio of 4K GoPro files on Android over USB is read-bound; `fileSource` block reads keep it bearable but it is
  untested for this access pattern.
