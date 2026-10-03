# Slow-mo Replays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each goal's clip, append a silent slow-motion replay of the moment (default 3 s before → 1 s after at 0.5×) without re-encoding video; plus fix proxy/full pairing when MP4s are added later via "+ Add file".

**Architecture:** Replays are extra `Cut`s with `speed` and `silent` produced by the pure `buildRenderPlan`. The Mediabunny engine scales packet timestamps/durations by `1/speed` and fills the replay's audio with silent AAC frames generated once per render via WebCodecs `AudioEncoder`. Spec: `docs/superpowers/specs/2026-10-03-slowmo-replays-design.md`.

**Tech Stack:** React 19, TypeScript, Zustand 5, Mediabunny 1.61, WebCodecs, Vitest 4.

---

## Context for the implementer

- Base: `main` (has A, B, C). Worktree `../shot-stopper-e`, branch `feat/replays`.
- Engine: `src/render/mediabunnyEngine.ts` (read it fully first). Cuts snap to keyframes; `cursor` is the output timeline position; open-GOP leading pictures are dropped; `cutEnd` = end of last copied video frame.
- `HighlightSegment.goals` holds the events in each merged segment (`matchTimeSec` is the original in-file time).
- `MatchEvent.matchTimeSec` is seconds within `files[sourceFileIndex]`.
- `isScoring(e)` in `src/utils/eventTypes.ts`.
- Commit after every task; end messages with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PK9v1f6jtuquzLVrffL9bt
  ```
- Never weaken tests. Lint count must not increase (record baseline). Type-check and build clean.
- Sub-project D (redesign) will later replace `GoalList` and restyle `ClipSettings`; keep your UI changes in those files small and behaviour-focused.

---

### Task 0: Worktree

```bash
cd /Users/foundersfactory/code/shot-stopper
git worktree add ../shot-stopper-e -b feat/replays main
cd ../shot-stopper-e && cp ../shot-stopper/localhost+2*.pem . 2>/dev/null; npm install && npm run test:run && npm run lint 2>&1 | tail -1
```

---

### Task 1: Attach full MP4s added later via "+ Add file"

Gap from sub-project B: loading LRVs, then adding the matching `GX…MP4` with "+ Add file" creates separate timeline entries instead of attaching.

**Files:** `src/components/FilePills.tsx`, `src/components/FilePills.test.tsx` (create)

- [ ] **Step 1: Failing test** (happy-dom). Seed store with a proxy entry `GL010226.LRV` (`kind: 'proxy'`). Mock `../utils/processFiles` so `processVideoFiles` records the files it receives and returns `{ files: [], error: null }`. Fire `change` on the hidden file input with `[GX010226.MP4, other.mp4]`. Expect: store entry 0 has `fullFile.name === 'GX010226.MP4'`; `processVideoFiles` was called with only `[other.mp4]`.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** in `onPick`, before calling `processVideoFiles`:

```ts
        const picked = Array.from(list)
        const fulls = picked.filter((f) => parseGoProName(f.name)?.kind === 'full')
        const unmatched = new Set(useAppState.getState().attachFullFiles(fulls))
        const rest = picked.filter((f) => !fulls.includes(f) || unmatched.has(f.name))
        if (rest.length === 0) { evt.target.value = ''; return }
        const result = await processVideoFiles(rest)
```

(import `parseGoProName` from `../utils/gopro`). Keep the existing error/`addFiles` handling for `result`.
- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `fix: attach full MP4s added after their LRV proxies`

---

### Task 2: Replay data in types and store

**Files:** `src/types.ts`, `src/state.ts`, `src/state.test.ts`, `src/utils/replays.ts`, `src/utils/replays.test.ts`

- [ ] **Step 1: Failing tests**

`src/utils/replays.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { wantsReplay } from './replays'
import type { MatchEvent } from '../types'

const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 10, type: 'goal', ...extra })

describe('wantsReplay', () => {
    it('should default to true for scoring events and false otherwise', () => {
        expect(wantsReplay(ev({}))).toBe(true)
        expect(wantsReplay(ev({ type: 'own_goal' }))).toBe(true)
        expect(wantsReplay(ev({ type: 'highlight' }))).toBe(false)
    })
    it('should respect an explicit override either way', () => {
        expect(wantsReplay(ev({ replay: false }))).toBe(false)
        expect(wantsReplay(ev({ type: 'save', replay: true }))).toBe(true)
    })
})
```

Append to `src/state.test.ts`:

```ts
describe('replay settings', () => {
    it('should default to 3 s before, 1 s after, 0.5× and persist them', () => {
        const init = useAppState.getInitialState()
        expect([init.replayBeforeSec, init.replayAfterSec, init.replaySpeed]).toEqual([3, 1, 0.5])
        s().setReplayWindow(2, 2)
        s().setReplaySpeed(0.25)
        expect([s().replayBeforeSec, s().replayAfterSec, s().replaySpeed]).toEqual([2, 2, 0.25])
        const persisted = JSON.parse(localStorage.getItem('vhm-state') ?? '{}').state
        expect(persisted).toMatchObject({ replayBeforeSec: 2, replayAfterSec: 2, replaySpeed: 0.25 })
    })
    it('should clamp the window to 0..15 s and speed to 0.25 or 0.5', () => {
        s().setReplayWindow(-1, 99)
        expect([s().replayBeforeSec, s().replayAfterSec]).toEqual([0, 15])
        s().setReplaySpeed(0.3)
        expect(s().replaySpeed).toBe(0.25)
    })
})
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**

`src/types.ts` — add to `MatchEvent`: `replay?: boolean   // explicit replay override; undefined = default for the type`.

`src/utils/replays.ts`:

```ts
import type { MatchEvent } from '../types'
import { isScoring } from './eventTypes'

export function wantsReplay(e: Pick<MatchEvent, 'type' | 'replay'>): boolean {
    return e.replay ?? isScoring(e)
}
```

`src/state.ts`: state `replayBeforeSec: 3, replayAfterSec: 1, replaySpeed: 0.5`; actions

```ts
            setReplayWindow: (before, after) => set({
                replayBeforeSec: Math.min(15, Math.max(0, before)),
                replayAfterSec: Math.min(15, Math.max(0, after)),
            }),
            setReplaySpeed: (speed) => set({ replaySpeed: speed <= 0.375 ? 0.25 : 0.5 }),
```

(types: `setReplayWindow: (before: number, after: number) => void`, `setReplaySpeed: (speed: number) => void`). Add the three fields to `partialize`. No version bump (new keys fall back to defaults on merge).
- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat: replay settings and per-event override`

---

### Task 3: Replay cuts in the render plan

**Files:** `src/render/types.ts`, `src/utils/renderPlan.ts`, `src/utils/renderPlan.test.ts`

- [ ] **Step 1: Failing tests** (append)

```ts
import type { MatchEvent } from '../types'

const g = (id: string, file: number, t: number, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id, matchTimeSec: t, sourceFileIndex: file, type: 'goal', ...extra })
const segWith = (file: number, start: number, end: number, goals: MatchEvent[]): HighlightSegment =>
    ({ sourceFileIndex: file, startTime: start, endTime: end, duration: end - start, goals })
const REPLAY = { beforeSec: 3, afterSec: 1, speed: 0.5 }

describe('buildRenderPlan — replays', () => {
    it('should append a silent slow replay after the segment for a goal', () => {
        expect(buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60)])], [100], REPLAY)).toEqual([
            { sourceIndex: 0, startSec: 50, endSec: 64 },
            { sourceIndex: 0, startSec: 57, endSec: 61, speed: 0.5, silent: true },
        ])
    })

    it('should add one replay per wanted event in a merged segment, in time order, skipping non-scoring', () => {
        const cuts = buildRenderPlan([segWith(0, 50, 70, [g('a', 0, 60), g('h', 0, 62, { type: 'highlight' }), g('b', 0, 66)])], [100], REPLAY)
        expect(cuts.slice(1).map((c) => c.startSec)).toEqual([57, 63])
    })

    it('should honour explicit overrides', () => {
        const cuts = buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60, { replay: false }), g('s', 0, 61, { type: 'save', replay: true })])], [100], REPLAY)
        expect(cuts.slice(1)).toEqual([{ sourceIndex: 0, startSec: 58, endSec: 62, speed: 0.5, silent: true }])
    })

    it('should clamp the replay window to its own file', () => {
        const cuts = buildRenderPlan([segWith(1, -5, 9, [g('a', 1, 1)])], [100, 100], REPLAY)
        expect(cuts.at(-1)).toEqual({ sourceIndex: 1, startSec: 0, endSec: 2, speed: 0.5, silent: true })
    })

    it('should add no replays when the option is omitted', () => {
        expect(buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60)])], [100])).toHaveLength(1)
    })
})
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**

`src/render/types.ts` — extend `Cut`:

```ts
export type Cut = {
    sourceIndex: number
    startSec: number
    endSec: number
    speed?: number    // < 1 = slow motion (timestamps stretched by 1/speed); default 1
    silent?: boolean  // replace source audio with silence
}
```

`src/utils/renderPlan.ts`:

```ts
import type { HighlightSegment } from './highlights'
import type { Cut } from '../render/types'
import { wantsReplay } from './replays'

export type ReplayOptions = { beforeSec: number; afterSec: number; speed: number }

export function buildRenderPlan(segments: HighlightSegment[], durationsSec: number[], replay?: ReplayOptions): Cut[] {
    const cuts: Cut[] = []
    const clamp = (sourceIndex: number, start: number, end: number): [number, number] => {
        const dur = durationsSec[sourceIndex] ?? Infinity
        return [Math.max(0, Math.min(start, dur)), Math.max(0, Math.min(end, dur))]
    }
    const push = (sourceIndex: number, start: number, end: number, extra: Partial<Cut> = {}): void => {
        const [startSec, endSec] = clamp(sourceIndex, start, end)
        if (endSec > startSec) cuts.push({ sourceIndex, startSec, endSec, ...extra })
    }
    for (const s of segments) {
        const idx = s.sourceFileIndex
        if (s.startTime < 0 && idx > 0) {
            const prevDur = durationsSec[idx - 1] ?? 0
            push(idx - 1, prevDur + s.startTime, prevDur)
            push(idx, 0, s.endTime)
        } else {
            push(idx, s.startTime, s.endTime)
        }
        if (!replay) continue
        const wanted = s.goals.filter(wantsReplay).sort((a, b) => a.matchTimeSec - b.matchTimeSec)
        for (const e of wanted) {
            push(e.sourceFileIndex ?? idx, e.matchTimeSec - replay.beforeSec, e.matchTimeSec + replay.afterSec, { speed: replay.speed, silent: true })
        }
    }
    return cuts
}
```

- [ ] **Step 4: Run → PASS** (all renderPlan tests); **Step 5: Commit** `feat: replay cuts in the render plan`

---

### Task 4: Highlight chapters and reel length include replays

**Files:** `src/utils/chapters.ts`, `src/utils/chapters.test.ts`, `src/components/ChaptersCopy.tsx`

- [ ] **Step 1: Failing test** (append)

```ts
describe('generateHighlightChapters — replays', () => {
    it('should push later chapters back by each earlier replay', () => {
        const events: MatchEvent[] = [
            { id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
            { id: 'b', matchTimeSec: 120, sourceFileIndex: 0, type: 'highlight' },
            { id: 'c', matchTimeSec: 180, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
        ]
        const out = generateHighlightChapters(events, [0], 10, 4, ['Whites', 'Colours'], { beforeSec: 3, afterSec: 1, speed: 0.5 })
        // segment = 14 s + 1 s buffer; goal a adds a 8 s replay
        expect(out).toContain('00:00 Goal 1-0 (Whites)')
        expect(out).toContain('00:23 Highlight')
        expect(out).toContain('00:38 Goal 2-0 (Whites)')
    })
})
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — add optional last parameter `replay?: ReplayOptions` (import the type from `./renderPlan`) to `generateHighlightChapters`; keep a running `extra` seconds: before printing event `i`, stamp = `i * (segmentLength + 1) + extra`; after printing, if `replay && wantsReplay(g)` then `extra += Math.round((replay.beforeSec + replay.afterSec) / replay.speed)`. `ChaptersCopy` passes `{ beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed }` from the store.
- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat: highlight chapters account for replays`

---

### Task 5: Silent AAC frames

**Files:** `src/render/silentAudio.ts`, `src/render/silentAudio.test.ts`

- [ ] **Step 1: Failing test** (node env): `makeSilentAudio({ sampleRate: 48000, numberOfChannels: 2 })` resolves to `null` when `globalThis.AudioEncoder` is undefined.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**

```ts
import { EncodedPacket } from 'mediabunny'

export type SilentAudio = {
    frameSec: number
    /** Packets covering `durationSec`, timestamps starting at 0. */
    packets: (durationSec: number) => EncodedPacket[]
}

// Encodes one second of silence once, then reuses those AAC frames for any duration.
export async function makeSilentAudio(cfg: { sampleRate: number; numberOfChannels: number }): Promise<SilentAudio | null> {
    if (typeof globalThis.AudioEncoder === 'undefined') return null
    const config: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: cfg.sampleRate, numberOfChannels: cfg.numberOfChannels, bitrate: 96_000 }
    const support = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }))
    if (!support.supported) return null

    const chunks: EncodedAudioChunk[] = []
    const encoder = new AudioEncoder({ output: (c) => chunks.push(c), error: () => undefined })
    encoder.configure(config)
    const frames = cfg.sampleRate // one second
    encoder.encode(new AudioData({
        format: 'f32-planar', sampleRate: cfg.sampleRate, numberOfFrames: frames,
        numberOfChannels: cfg.numberOfChannels, timestamp: 0,
        data: new Float32Array(frames * cfg.numberOfChannels),
    }))
    await encoder.flush()
    encoder.close()
    if (chunks.length === 0) return null

    const frameSec = 1024 / cfg.sampleRate
    // Skip the first chunk (encoder priming), loop the steady-state frames.
    const loop = chunks.length > 2 ? chunks.slice(1, -1) : chunks
    return {
        frameSec,
        packets: (durationSec) => {
            const n = Math.ceil(durationSec / frameSec)
            return Array.from({ length: n }, (_, i) =>
                EncodedPacket.fromEncodedChunk(loop[i % loop.length]).clone({ timestamp: i * frameSec, duration: frameSec }))
        },
    }
}
```

- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat: silent AAC frames for replays`

---

### Task 6: Engine — speed and silent cuts

**Files:** `src/render/mediabunnyEngine.ts`

Not unit-tested (CLAUDE.md); verified in Task 8.

- [ ] **Step 1:** At render start, if any cut is `silent` and `first.audio` exists: `const silence = await makeSilentAudio({ sampleRate: first.audio.sampleRate, numberOfChannels: first.audio.numberOfChannels })`; if `null`, `console.warn('Replay audio: no AAC encoder, leaving a gap')`.
- [ ] **Step 2:** In the cut loop, `const speed = cut.speed ?? 1`. Video packets:

```ts
                    const rel = (p.timestamp - cutStart) / speed
                    await vOut.add(p.clone({ timestamp: cursor + rel, duration: p.duration / speed }), vFirst ? vMeta : undefined)
```

(replace the current `p.timestamp + offset` clone; keep the leading-picture skip and progress logic). `cutEnd` logic unchanged (source time). Output span = `(cutEnd - cutStart) / speed`.
- [ ] **Step 3:** Audio:
  - Not silent: unchanged path (only valid for `speed === 1`; if a non-silent cut has `speed !== 1`, treat it as silent — slowed audio would need re-encoding).
  - Silent: if `silence && aOut`, for each `p` of `silence.packets(span)`: `await aOut.add(p.clone({ timestamp: cursor + p.timestamp }), aFirst ? aMeta : undefined)`; `aFirst = false`.
- [ ] **Step 4:** `cursor += (cutEnd - cutStart) / speed`. Progress `span(cut)` stays in source seconds (work done), which is fine.
- [ ] **Step 5:** `npx tsc -b --noEmit` clean; commit `feat: slow-motion and silent cuts in the render engine`.

---

### Task 7: UI — wire replays into render, list toggle, settings

**Files:** `src/components/RenderHighlights.tsx` (+ its test), `src/components/GoalList.tsx`, `src/components/GoalList.test.tsx`, `src/components/ClipSettings.tsx`, `src/components/ClipSettings.test.tsx` (create)

- [ ] **Step 1: Failing tests**
  - RenderHighlights: with one goal at 100 s, `renderReel` is called with cuts `[{0, 90, 104}, {0, 97, 101, speed 0.5, silent true}]`.
  - GoalList: each row has a button `aria-label="Replay"` with `aria-pressed` = `wantsReplay(e)`; clicking it on a goal sets `replay: false`; clicking on a highlight sets `replay: true`.
  - ClipSettings: inputs labelled "Replay before" / "Replay after" and a select "Replay speed" update the store.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**
  - RenderHighlights: `buildRenderPlan(segments, durations, { beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed })` (store selectors).
  - GoalList row: `<button aria-label="Replay" aria-pressed={wantsReplay(g)} title="Slow-mo replay" onClick={() => update(g.id, { replay: !wantsReplay(g) })}>↻</button>` styled like the existing row buttons; dim when not pressed.
  - ClipSettings: a "Replay" group with two number inputs (0–15) and a select (0.5×, 0.25×), using `setReplayWindow` / `setReplaySpeed`.
- [ ] **Step 4: Run all tests → PASS**; **Step 5: Commit** `feat: replay toggle per event and replay settings`

---

### Task 8: Verify on real output

- [ ] Generate test media (scratchpad): a 120 s HEVC closed-GOP file like GoPro and an H.264 LRV-style file, e.g.

```bash
ffmpeg -v error -f lavfi -i testsrc2=duration=120:size=1280x720:rate=30000/1001 -f lavfi -i sine=frequency=440:duration=120 \
  -c:v libx265 -tag:v hvc1 -x265-params keyint=30:min-keyint=30:open-gop=0:bframes=0 -c:a aac -ac 2 -ar 48000 -shortest GX010009.MP4
```

- [ ] Dev server on port 5179 (`npx vite --port 5179 --strictPort`), headless Chrome via a Playwright Node script (examples in `/private/tmp/claude-501/-Users-foundersfactory-code-shot-stopper/9a0d1d18-93c2-45ab-8fc1-734bff63b2c3/scratchpad/b11/`). Load the file, mark a goal at 60 s (G, Enter, Esc), render full quality, save the output.
- [ ] Check with ffprobe/ffmpeg:
  - duration ≈ clip (14 s, keyframe-snapped ~15 s) + replay (4 s window snapped to keyframes ≈ 5 s, at 0.5× ≈ 10 s);
  - `ffprobe -select_streams v -show_entries packet=pts_time -of csv` around the replay: packet spacing ≈ 2 × 1/29.97 s;
  - audio packets continuous across the replay (no gap > 1 frame), and the replay section is silent (`ffmpeg -ss <replay start> -t 5 -i out.mp4 -af volumedetect -f null -` → max_volume very low, e.g. < −60 dB);
  - `ffmpeg -v error -i out.mp4 -f null -` prints nothing;
  - AVFoundation decode: reuse the `avcheck` binary in the scratchpad if present (`./avcheck out.mp4`).
- [ ] Repeat with the LRV-style H.264 file (preview reel).
- [ ] Record results in the spec under `## Verification`; update CLAUDE.md (replays in Core workflow + architecture). Commit `docs: replay verification`.

Do not merge into main.
