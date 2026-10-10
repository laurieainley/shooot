# Suggested goals (C: audio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Find goals (Beta)" analyses the match audio in the browser, suggests up to 30 moments, and lets the user triage them
(goal / own goal / save / highlight / not a goal) into normal events, with a "You kept X of Y" summary.

**Architecture:** Pure maths in `src/utils/` (FFT, streaming audio features, goal score, suggestion helpers); decoding with
Mediabunny on the main thread and feature extraction in a Web Worker (`src/detect/`); one detection job outside the UI
(`src/detectJobs.ts`, pattern of `renderJobs.ts`); suggestions persisted in the Zustand store (v17); review UI in a
`ColumnPanel` so the video stays visible; pending suggestions drawn as hollow rings on the match strip.

**Tech Stack:** React 19, TypeScript strict, Zustand 5 (persist), Mediabunny (`Input`, `AudioSampleSink`), Web Workers
(Vite `new URL(..., import.meta.url)`), Vitest + RTL + happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-11-suggested-goals-design.md`

## Global Constraints

- Read `AGENTS.md` and `brand/shooot/BRAND.md` first; use the `shooot-brand` skill before UI work.
- Utils are pure (no React, no store imports) and every `src/utils/*.ts` has a `*.test.ts`.
- Explicit return types on exported functions; no `any` (use `unknown` + narrowing).
- One component per file, named exports, props interface above the component.
- Persisted shape change ⇒ version bump **16 → 17** + migration + test.
- Read files only through `render/fileSource.ts` (`fileSource(file)`), never `BlobSource`.
- No timers on the detection path; yield with `yieldToEventLoop()` from `src/render/yield.ts`.
- Colours only via `--sh-*` tokens. Lime only for the **Goal** action (use the existing `btn-primary` class; do not add lime to
  App.css — `utils/limeUsage.test.ts` guards it). Red (`--sh-rec`) not used by this feature.
- Copy: UK English, sentence case, "Shooot" spelling; brand voice only in progress/empty/success lines (`utils/voice.ts`);
  instructions and errors plain. Exact strings: menu **"Find goals"** / **"Review suggestions"**, tag **"Beta"**, progress
  **"Listening for the roar… N%"**, summary **"You kept K of N."**, low-keep note **"Detection struggled on this footage. Copy
  diagnostics and send it over."**, no suggestions **"Nothing stood out in the audio. Tag goals as you watch."**
- Touch targets ≥ 44 px; text ≥ 14 px on touch; contrast ≥ 4.5:1; respect `prefers-reduced-motion`.
- All tunables come from `AUDIO_DETECT` in `src/detect/detectConfig.ts` (values below, verbatim from the spec).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the trailer given in your brief).
- Gates before "done": `npm run test:run`, `npx tsc -b --noEmit`, `npm run build`, `npm run lint` (baseline 12 problems, add none).

## Review Focus

1. **A file with no audio track** (or a silent file among several): detection must not throw; that span yields no suggestions; other files still work. → test in Task 4.
2. **Undo after keeping a suggestion:** the event disappears and the suggestion must count as pending again (no stale "kept"), and keeping it again must not create a duplicate. → test in Task 3.
3. **"Find goals again" after a partial review:** decisions kept, no new suggestion within `minGapSec / 2` of a decided one, pending ones replaced. → test in Task 3.
4. **Kick off / Final whistle markers:** only `[kickOff, finalWhistle]` is suggested; no markers ⇒ whole timeline; whistle before kick off ⇒ whole timeline. → test in Task 4.
5. **Very short or empty footage / zero suggestions:** summary must read the "Nothing stood out…" line, never "You kept 0 of 0." or a divide-by-zero low-keep note. → test in Task 5.

---

## File structure

| File | Responsibility |
|---|---|
| `src/utils/fft.ts` (+ test) | Radix-2 power spectrum of a real frame |
| `src/utils/audioFeatures.ts` (+ test) | `downmix`, streaming `FeatureAccumulator` (loudness + voice-band dB per hop) |
| `src/utils/goalAudioScore.ts` (+ test) | smoothing, robust z, goal score series, timeline placement, top-N picking |
| `src/utils/suggestions.ts` (+ test) | merge on re-run, effective status, summary counts, strip marks, diagnostics text |
| `src/detect/detectConfig.ts` | `AUDIO_DETECT` tunables |
| `src/detect/audioSource.ts` | Mediabunny decode → mono chunks (engine boundary, not unit-tested) |
| `src/detect/audioFeatures.worker.ts` | Worker wrapper around `FeatureAccumulator` |
| `src/detect/featureExtractor.ts` | Worker client with in-thread fallback |
| `src/detect/runAudioDetection.ts` (+ test) | Orchestrates decode → features → score → moments, with injectable deps |
| `src/detectJobs.ts` (+ test) | The one detection job: phase, progress, cancel, wake lock, writes suggestions |
| `src/types.ts` | `Suggestion`, `SuggestionRun`, `KeepType` |
| `src/state.ts` (+ test) | suggestions state/actions, panel `'review'`, persist v17 |
| `src/components/applyProject.ts` | clear suggestions on project import |
| `src/utils/voice.ts` (+ test) | progress/summary lines |
| `src/components/useReviewLoop.ts` | loop the player around the current suggestion |
| `src/components/DetectProgress.tsx` | progress / failure / cancel |
| `src/components/SuggestionCard.tsx` | one suggestion: actions, keys, team step |
| `src/components/SuggestionSummary.tsx` | summary, copy diagnostics, dev copy scores, run again |
| `src/components/SuggestionReview.tsx` (+ test) | ColumnPanel container switching between the three |
| `src/components/BetaTag.tsx` | the small "Beta" tag |
| `src/components/OverflowMenu.tsx` (+ test) | "Find goals" / "Review suggestions" menu item |
| `src/components/EventLog.tsx` (+ test) | "Find goals" button in the empty state |
| `src/components/Panels.tsx` | route panel `'review'` |
| `src/components/MatchStrip.tsx` (+ test) | hollow rings for pending suggestions |
| `src/App.css` | `.review*`, `.beta-tag`, `.strip-suggestion` (tokens only, no lime) |

---

### Task 1: FFT and streaming audio features

**Files:**
- Create: `src/utils/fft.ts`, `src/utils/fft.test.ts`, `src/utils/audioFeatures.ts`, `src/utils/audioFeatures.test.ts`

**Interfaces:**
- Produces: `powerSpectrum(frame: Float32Array): Float32Array`; `downmix(interleaved: Float32Array, channels: number): Float32Array`;
  `type AudioFeatures = { hopSec: number; loudDb: Float32Array; voiceDb: Float32Array }`;
  `class FeatureAccumulator { constructor(sampleRate: number, hopSec: number, voiceHz: readonly [number, number]); push(mono: Float32Array): void; finish(): AudioFeatures; get frames(): number }`

- [ ] **Step 1: Write the failing tests**

`src/utils/fft.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { powerSpectrum } from './fft'

describe('powerSpectrum', () => {
    it('should put a pure tone in its frequency bin', () => {
        const n = 1024, k = 37
        const frame = new Float32Array(n).map((_, i) => Math.sin((2 * Math.PI * k * i) / n))
        const p = powerSpectrum(frame)
        expect(p.length).toBe(n / 2 + 1)
        const peak = p.indexOf(Math.max(...p))
        expect(peak).toBe(k)
    })
    it('should give zero power for silence', () => {
        expect(Math.max(...powerSpectrum(new Float32Array(256)))).toBe(0)
    })
    it('should reject lengths that are not a power of two', () => {
        expect(() => powerSpectrum(new Float32Array(300))).toThrow()
    })
})
```

`src/utils/audioFeatures.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { downmix, FeatureAccumulator } from './audioFeatures'

const tone = (hz: number, sr: number, sec: number, amp = 0.5): Float32Array =>
    new Float32Array(Math.round(sr * sec)).map((_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr))

describe('downmix', () => {
    it('should average interleaved channels', () => {
        expect(Array.from(downmix(new Float32Array([1, 0, 0.5, 0.5]), 2))).toEqual([0.5, 0.5])
    })
    it('should return a copy for mono', () => {
        const a = new Float32Array([0.1, 0.2])
        const m = downmix(a, 1)
        expect(Array.from(m)).toEqual(Array.from(a))
        expect(m).not.toBe(a)
    })
})

describe('FeatureAccumulator', () => {
    it('should emit one frame per whole hop', () => {
        const acc = new FeatureAccumulator(16000, 0.2, [300, 3000])
        acc.push(tone(1000, 16000, 1.1))
        const f = acc.finish()
        expect(f.loudDb.length).toBe(5)
        expect(f.voiceDb.length).toBe(5)
        expect(f.hopSec).toBe(0.2)
    })
    it('should count a 1 kHz tone as voice band and a 6 kHz tone as not', () => {
        const a = new FeatureAccumulator(48000, 0.2, [300, 3000]); a.push(tone(1000, 48000, 1))
        const b = new FeatureAccumulator(48000, 0.2, [300, 3000]); b.push(tone(6000, 48000, 1))
        const fa = a.finish(), fb = b.finish()
        expect(fa.loudDb[2] - fa.voiceDb[2]).toBeLessThan(1)
        expect(fb.loudDb[2] - fb.voiceDb[2]).toBeGreaterThan(20)
    })
    it('should not depend on how the samples are chunked', () => {
        const sig = tone(800, 16000, 2)
        const one = new FeatureAccumulator(16000, 0.2, [300, 3000]); one.push(sig)
        const many = new FeatureAccumulator(16000, 0.2, [300, 3000])
        for (let i = 0; i < sig.length; i += 777) many.push(sig.subarray(i, i + 777))
        expect(Array.from(many.finish().loudDb)).toEqual(Array.from(one.finish().loudDb))
    })
    it('should give finite values for silence', () => {
        const acc = new FeatureAccumulator(16000, 0.2, [300, 3000]); acc.push(new Float32Array(16000))
        expect(acc.finish().loudDb.every(Number.isFinite)).toBe(true)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/fft.test.ts src/utils/audioFeatures.test.ts`
Expected: FAIL — cannot find module `./fft` / `./audioFeatures`.

- [ ] **Step 3: Implement**

`src/utils/fft.ts`:
```ts
/** Power spectrum |X[k]|² (k = 0…n/2) of a real frame by an iterative radix-2 FFT. `frame.length` must be a power of two. */
export function powerSpectrum(frame: Float32Array): Float32Array {
    const n = frame.length
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT length must be a power of two, got ${n}`)
    const re = Float64Array.from(frame), im = new Float64Array(n)
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = a + len / 2
                const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
                re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
            }
        }
    }
    const out = new Float32Array(n / 2 + 1)
    for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k]
    return out
}
```

`src/utils/audioFeatures.ts`:
```ts
import { powerSpectrum } from './fft'

/** Loudness and voice-band energy (dB) per hop of a whole file. */
export type AudioFeatures = { hopSec: number; loudDb: Float32Array; voiceDb: Float32Array }

/** Mono from interleaved samples (average of the channels); always a new array. */
export function downmix(interleaved: Float32Array, channels: number): Float32Array {
    if (channels <= 1) return interleaved.slice()
    const n = Math.floor(interleaved.length / channels), out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        let s = 0
        for (let c = 0; c < channels; c++) s += interleaved[i * channels + c]
        out[i] = s / channels
    }
    return out
}

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, n)))

/**
 * Streams mono samples into fixed hops (Hann-windowed, zero-padded to a power of two) and keeps, per hop, the total
 * power and the power inside `voiceHz`, in dB. Chunk boundaries do not change the result; a trailing partial hop is dropped.
 */
export class FeatureAccumulator {
    private readonly hop: number
    private readonly fftSize: number
    private readonly window: Float32Array
    private readonly lo: number
    private readonly hi: number
    private readonly buf: Float32Array
    private fill = 0
    private readonly loud: number[] = []
    private readonly voice: number[] = []

    constructor(sampleRate: number, private readonly hopSec: number, voiceHz: readonly [number, number]) {
        this.hop = Math.max(2, Math.round(sampleRate * hopSec))
        this.fftSize = nextPow2(this.hop)
        this.window = new Float32Array(this.hop).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.hop))
        const binHz = sampleRate / this.fftSize
        this.lo = Math.max(1, Math.ceil(voiceHz[0] / binHz))
        this.hi = Math.min(this.fftSize / 2, Math.floor(voiceHz[1] / binHz))
        this.buf = new Float32Array(this.hop)
    }

    get frames(): number { return this.loud.length }

    push(mono: Float32Array): void {
        let i = 0
        while (i < mono.length) {
            const take = Math.min(this.hop - this.fill, mono.length - i)
            this.buf.set(mono.subarray(i, i + take), this.fill)
            this.fill += take; i += take
            if (this.fill === this.hop) { this.frame(); this.fill = 0 }
        }
    }

    finish(): AudioFeatures {
        return { hopSec: this.hopSec, loudDb: Float32Array.from(this.loud), voiceDb: Float32Array.from(this.voice) }
    }

    private frame(): void {
        const x = new Float32Array(this.fftSize)
        for (let i = 0; i < this.hop; i++) x[i] = this.buf[i] * this.window[i]
        const p = powerSpectrum(x)
        let total = 0, band = 0
        for (let k = 0; k < p.length; k++) total += p[k]
        for (let k = this.lo; k <= this.hi; k++) band += p[k]
        this.loud.push(10 * Math.log10(total + 1e-12))
        this.voice.push(10 * Math.log10(band + 1e-12))
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/fft.test.ts src/utils/audioFeatures.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/fft.ts src/utils/fft.test.ts src/utils/audioFeatures.ts src/utils/audioFeatures.test.ts
git commit -m "feat(detect): FFT power spectrum and streaming audio features"
```

---

### Task 2: Goal score, moment picking, config and types

**Files:**
- Create: `src/detect/detectConfig.ts`, `src/utils/goalAudioScore.ts`, `src/utils/goalAudioScore.test.ts`
- Modify: `src/types.ts` (append types)

**Interfaces:**
- Consumes: `AudioFeatures` (Task 1).
- Produces:
  - `AUDIO_DETECT` (below), `type AudioDetectConfig = typeof AUDIO_DETECT`
  - `movingAverage(x: Float32Array, n: number): Float32Array`
  - `robustZ(x: Float32Array): Float32Array` (NaN in → 0 out; median/MAD over finite values)
  - `placeOnTimeline(parts: { features: AudioFeatures; offsetSec: number }[], totalSec: number, hopSec: number): AudioFeatures` (gaps NaN)
  - `goalScores(f: AudioFeatures, cfg: Pick<AudioDetectConfig, 'smoothSec' | 'peakWindowSec' | 'hushWindowSec'>): Float32Array`
  - `type ScoredMoment = { timeSec: number; score: number }`
  - `pickMoments(scores: Float32Array, hopSec: number, opts: { minGapSec: number; max: number; startSec: number; endSec: number }): ScoredMoment[]` (sorted by time)
  - types in `src/types.ts`:
    ```ts
    export type KeepType = Extract<EventType, 'goal' | 'own_goal' | 'save' | 'highlight'>
    export type SuggestionStatus = 'pending' | 'kept' | 'rejected'
    export type Suggestion = {
        id: string
        globalTimeSec: number
        score: number
        source: 'audio'
        status: SuggestionStatus
        keptAs?: KeepType
        eventId?: string
    }
    export type SuggestionRun = { createdAt: number; source: 'audio'; configVersion: number; analysedSec: number; total: number }
    ```

- [ ] **Step 1: Write the config and types (no test needed for constants)**

`src/detect/detectConfig.ts`:
```ts
/** Every tunable of audio goal suggestions (spec: docs/superpowers/specs/2026-10-11-suggested-goals-design.md). Bump `version` when a value changes. */
export const AUDIO_DETECT = {
    version: 1,
    hopSec: 0.2,
    smoothSec: 1,
    voiceHz: [300, 3000] as readonly [number, number],
    peakWindowSec: [-3, 3] as readonly [number, number],
    hushWindowSec: [5, 15] as readonly [number, number],
    minGapSec: 20,
    maxSuggestions: 30,
    eventOffsetSec: -2,
    reviewWindowSec: [-8, 4] as readonly [number, number],
    lowKeepRatio: 0.15,
} as const

export type AudioDetectConfig = typeof AUDIO_DETECT
```
Append the types above to `src/types.ts`.

- [ ] **Step 2: Write the failing tests** — `src/utils/goalAudioScore.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { goalScores, movingAverage, pickMoments, placeOnTimeline, robustZ } from './goalAudioScore'
import type { AudioFeatures } from './audioFeatures'

const HOP = 0.2
const CFG = { smoothSec: 1, peakWindowSec: [-3, 3] as const, hushWindowSec: [5, 15] as const }
let seed = 7
const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

/** Steady background with optional events: shout = voice and loudness up; hush = loudness down. */
function match(sec: number, events: { at: number; shout: number; hushFor: number }[], gainDb = 0): AudioFeatures {
    const n = Math.round(sec / HOP), loud = new Float32Array(n), voice = new Float32Array(n)
    for (let i = 0; i < n; i++) { const b = -30 + gainDb + rnd() * 2; loud[i] = b; voice[i] = b - 3 + rnd() }
    for (const e of events) {
        const i0 = Math.round(e.at / HOP)
        for (let i = i0; i < i0 + 10 && i < n; i++) { loud[i] += e.shout; voice[i] += e.shout + 2 }
        for (let i = i0 + 25; i < i0 + 25 + e.hushFor / HOP && i < n; i++) loud[i] -= 8
    }
    return { hopSec: HOP, loudDb: loud, voiceDb: voice }
}

describe('movingAverage', () => {
    it('should average a centred window and keep the length', () => {
        expect(Array.from(movingAverage(new Float32Array([0, 0, 3, 0, 0]), 3))).toEqual([0, 1, 1, 1, 0])
    })
})

describe('robustZ', () => {
    it('should centre on the median and map NaN to 0', () => {
        const z = robustZ(new Float32Array([1, 2, 3, 4, 100, NaN]))
        expect(z[2]).toBeCloseTo(0)
        expect(z[5]).toBe(0)
        expect(z[4]).toBeGreaterThan(10)
    })
})

describe('goalScores + pickMoments', () => {
    it('should rank a shout followed by a hush first', () => {
        const f = match(600, [{ at: 100, shout: 12, hushFor: 10 }, { at: 300, shout: 12, hushFor: 0 }])
        const m = pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 1, startSec: 0, endSec: 600 })
        expect(Math.abs(m[0].timeSec - 101)).toBeLessThanOrEqual(4)
    })
    it('should not depend on overall gain', () => {
        const ev = [{ at: 120, shout: 10, hushFor: 10 }, { at: 400, shout: 9, hushFor: 10 }]
        seed = 7; const a = match(600, ev); seed = 7; const b = match(600, ev, 25)
        const opts = { minGapSec: 20, max: 5, startSec: 0, endSec: 600 }
        expect(pickMoments(goalScores(b, CFG), HOP, opts).map((x) => x.timeSec)).toEqual(pickMoments(goalScores(a, CFG), HOP, opts).map((x) => x.timeSec))
    })
    it('should keep picks at least minGapSec apart, within range, at most max, sorted by time', () => {
        const f = match(900, [{ at: 100, shout: 12, hushFor: 10 }, { at: 110, shout: 12, hushFor: 10 }, { at: 500, shout: 12, hushFor: 10 }])
        const m = pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 30, startSec: 50, endSec: 800 })
        for (let i = 1; i < m.length; i++) expect(m[i].timeSec - m[i - 1].timeSec).toBeGreaterThanOrEqual(20)
        expect(m.every((x) => x.timeSec >= 50 && x.timeSec <= 800)).toBe(true)
        expect(m.length).toBeLessThanOrEqual(30)
        expect(pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 2, startSec: 0, endSec: 900 }).length).toBe(2)
    })
    it('should return nothing for an empty or out-of-range span', () => {
        expect(pickMoments(new Float32Array(0), HOP, { minGapSec: 20, max: 30, startSec: 0, endSec: 100 })).toEqual([])
        const f = match(100, [])
        expect(pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 30, startSec: 200, endSec: 300 })).toEqual([])
    })
})

describe('placeOnTimeline', () => {
    it('should put each file at its offset and leave gaps as NaN', () => {
        const a = { hopSec: HOP, loudDb: new Float32Array([1, 1]), voiceDb: new Float32Array([1, 1]) }
        const t = placeOnTimeline([{ features: a, offsetSec: 0 }, { features: a, offsetSec: 1 }], 1.4, HOP)
        expect(t.loudDb.length).toBe(7)
        expect(t.loudDb[0]).toBe(1); expect(t.loudDb[5]).toBe(1); expect(Number.isNaN(t.loudDb[3])).toBe(true)
    })
})
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/utils/goalAudioScore.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement** — `src/utils/goalAudioScore.ts`:
```ts
import type { AudioFeatures } from './audioFeatures'

export type ScoredMoment = { timeSec: number; score: number }

/** Centred moving average over `n` samples (edges average what is available); NaN samples are skipped. */
export function movingAverage(x: Float32Array, n: number): Float32Array {
    const out = new Float32Array(x.length), h = Math.floor(n / 2)
    for (let i = 0; i < x.length; i++) {
        let s = 0, c = 0
        for (let j = Math.max(0, i - h); j <= Math.min(x.length - 1, i + h); j++) if (!Number.isNaN(x[j])) { s += x[j]; c++ }
        out[i] = c ? s / c : NaN
    }
    return out
}

const median = (v: number[]): number => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** (x − median) / (1.4826·MAD) over the finite values; NaN becomes 0 (neutral). */
export function robustZ(x: Float32Array): Float32Array {
    const fin = Array.from(x).filter(Number.isFinite)
    const out = new Float32Array(x.length)
    if (fin.length === 0) return out
    const med = median(fin), mad = median(fin.map((v) => Math.abs(v - med))) * 1.4826 + 1e-9
    for (let i = 0; i < x.length; i++) out[i] = Number.isFinite(x[i]) ? (x[i] - med) / mad : 0
    return out
}

/** Joins per-file features on the whole timeline (files are contiguous, `offsetSec` from computeCumulativeOffsets); gaps are NaN. */
export function placeOnTimeline(parts: { features: AudioFeatures; offsetSec: number }[], totalSec: number, hopSec: number): AudioFeatures {
    const n = Math.max(0, Math.round(totalSec / hopSec))
    const loud = new Float32Array(n).fill(NaN), voice = new Float32Array(n).fill(NaN)
    for (const { features, offsetSec } of parts) {
        const at = Math.round(offsetSec / hopSec)
        for (let i = 0; i < features.loudDb.length && at + i < n; i++) { loud[at + i] = features.loudDb[i]; voice[at + i] = features.voiceDb[i] }
    }
    return { hopSec, loudDb: loud, voiceDb: voice }
}

/** score(t) = max(voice z over t+peak window) − mean(loudness z over t+hush window), after `smoothSec` smoothing. */
export function goalScores(f: AudioFeatures, cfg: { smoothSec: number; peakWindowSec: readonly [number, number]; hushWindowSec: readonly [number, number] }): Float32Array {
    const hop = f.hopSec, sm = Math.max(1, Math.round(cfg.smoothSec / hop))
    const loud = robustZ(movingAverage(f.loudDb, sm)), voice = robustZ(movingAverage(f.voiceDb, sm))
    const n = loud.length, out = new Float32Array(n)
    const [pa, pb] = cfg.peakWindowSec.map((s) => Math.round(s / hop)), [ha, hb] = cfg.hushWindowSec.map((s) => Math.round(s / hop))
    for (let i = 0; i < n; i++) {
        let peak = -Infinity
        for (let j = Math.max(0, i + pa); j <= Math.min(n - 1, i + pb); j++) peak = Math.max(peak, voice[j])
        let s = 0, c = 0
        for (let j = Math.max(0, i + ha); j <= Math.min(n - 1, i + hb); j++) { s += loud[j]; c++ }
        out[i] = (peak === -Infinity ? 0 : peak) - (c ? s / c : 0)
    }
    return out
}

/** Highest-scoring moments inside [startSec, endSec], at least `minGapSec` apart, at most `max`, returned in time order. */
export function pickMoments(scores: Float32Array, hopSec: number, opts: { minGapSec: number; max: number; startSec: number; endSec: number }): ScoredMoment[] {
    const order = Array.from(scores.keys()).filter((i) => {
        const t = i * hopSec
        return t >= opts.startSec && t <= opts.endSec && Number.isFinite(scores[i])
    }).sort((a, b) => scores[b] - scores[a])
    const picked: ScoredMoment[] = []
    for (const i of order) {
        if (picked.length >= opts.max) break
        const t = i * hopSec
        if (picked.every((p) => Math.abs(p.timeSec - t) >= opts.minGapSec)) picked.push({ timeSec: Math.round(t * 10) / 10, score: scores[i] })
    }
    return picked.sort((a, b) => a.timeSec - b.timeSec)
}
```

- [ ] **Step 5: Run tests** — `npx vitest run src/utils/goalAudioScore.test.ts` → PASS. Run `npx tsc -b --noEmit` → no errors.

- [ ] **Step 6: Commit**
```bash
git add src/detect/detectConfig.ts src/utils/goalAudioScore.ts src/utils/goalAudioScore.test.ts src/types.ts
git commit -m "feat(detect): audio goal score, moment picking, config and suggestion types"
```

---

### Task 3: Suggestion helpers and store (persist v17)

**Files:**
- Create: `src/utils/suggestions.ts`, `src/utils/suggestions.test.ts`
- Modify: `src/state.ts` (state, actions, `Panel` adds `'review'`, `clear`, `newMatch`, `partialize`, version 17 + migration), `src/state.test.ts`, `src/components/applyProject.ts`

**Interfaces:**
- Consumes: `Suggestion`, `SuggestionRun`, `KeepType` (Task 2); `ScoredMoment` (Task 2); `globalToFileTime` from `src/utils/matchStrip.ts`.
- Produces (utils):
  - `effectiveStatus(s: Suggestion, eventIds: ReadonlySet<string>): SuggestionStatus` — kept whose event is gone ⇒ `'pending'`
  - `mergeSuggestions(prev: Suggestion[], next: ScoredMoment[], minGapSec: number, makeId: () => string): Suggestion[]` — keeps decided (kept with live event, or rejected), drops pending, adds new moments not within `minGapSec / 2` of a decided one; sorted by time
  - `type ReviewCounts = { total: number; kept: number; rejected: number; pending: number; byType: Partial<Record<KeepType, number>> }`
  - `reviewCounts(suggestions: Suggestion[], eventIds: ReadonlySet<string>): ReviewCounts`
  - `suggestionMarks(suggestions: Suggestion[], eventIds: ReadonlySet<string>, totalSec: number): { id: string; leftPct: number; timeSec: number }[]` (pending only)
  - `detectionReport(run: SuggestionRun | null, counts: ReviewCounts): string`
- Produces (store, on `useAppState`):
  - state `suggestions: Suggestion[]`, `suggestionRun: SuggestionRun | null`, `reviewIndex: number` (not persisted)
  - `setSuggestions(run: SuggestionRun, moments: ScoredMoment[]): void`
  - `decideSuggestion(id: string, decision: { kind: 'reject' } | { kind: 'keep'; type: KeepType; team?: string }): void`
  - `clearSuggestions(): void`, `setReviewIndex(i: number): void`, `openReviewAt(id: string): void` (sets index of that suggestion, opens panel `'review'`)

- [ ] **Step 1: Write failing util tests** — `src/utils/suggestions.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectionReport, effectiveStatus, mergeSuggestions, reviewCounts, suggestionMarks } from './suggestions'
import type { Suggestion } from '../types'

const s = (id: string, t: number, status: Suggestion['status'] = 'pending', extra: Partial<Suggestion> = {}): Suggestion =>
    ({ id, globalTimeSec: t, score: 1, source: 'audio', status, ...extra })
let n = 0
const makeId = (): string => `new${++n}`

describe('effectiveStatus', () => {
    it('should treat a kept suggestion whose event was undone as pending', () => {
        const k = s('a', 10, 'kept', { eventId: 'e1', keptAs: 'goal' })
        expect(effectiveStatus(k, new Set(['e1']))).toBe('kept')
        expect(effectiveStatus(k, new Set())).toBe('pending')
    })
})

describe('mergeSuggestions', () => {
    it('should keep decisions, replace pending and skip new moments next to decided ones', () => {
        const prev = [s('a', 100, 'kept', { eventId: 'e1', keptAs: 'goal' }), s('b', 300, 'rejected'), s('c', 500)]
        const out = mergeSuggestions(prev, [{ timeSec: 105, score: 9 }, { timeSec: 700, score: 5 }, { timeSec: 505, score: 4 }], 20, makeId)
        expect(out.map((x) => x.globalTimeSec)).toEqual([100, 300, 505, 700])
        expect(out.find((x) => x.globalTimeSec === 100)?.status).toBe('kept')
        expect(out.some((x) => x.id === 'c')).toBe(false)
    })
})

describe('reviewCounts', () => {
    it('should count by effective status and kept type', () => {
        const list = [s('a', 1, 'kept', { eventId: 'e1', keptAs: 'goal' }), s('b', 2, 'kept', { eventId: 'gone', keptAs: 'save' }), s('c', 3, 'rejected'), s('d', 4)]
        expect(reviewCounts(list, new Set(['e1']))).toEqual({ total: 4, kept: 1, rejected: 1, pending: 2, byType: { goal: 1 } })
    })
})

describe('suggestionMarks', () => {
    it('should place pending suggestions as a percentage of the timeline', () => {
        expect(suggestionMarks([s('a', 50), s('b', 75, 'rejected')], new Set(), 100)).toEqual([{ id: 'a', leftPct: 50, timeSec: 50 }])
        expect(suggestionMarks([s('a', 50)], new Set(), 0)).toEqual([])
    })
})

describe('detectionReport', () => {
    it('should list counts and settings without timestamps', () => {
        const text = detectionReport({ createdAt: 0, source: 'audio', configVersion: 1, analysedSec: 2940, total: 30 },
            { total: 30, kept: 6, rejected: 20, pending: 4, byType: { goal: 5, save: 1 } })
        expect(text).toContain('Find goals (Beta), audio, config v1')
        expect(text).toContain('Analysed: 49:00')
        expect(text).toContain('Kept 6 of 30 (goal 5, save 1), rejected 20, not reviewed 4')
    })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/utils/suggestions.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `src/utils/suggestions.ts`:
```ts
import type { KeepType, Suggestion, SuggestionRun, SuggestionStatus } from '../types'
import type { ScoredMoment } from './goalAudioScore'

/** A kept suggestion whose event no longer exists (undone or deleted) is pending again. */
export function effectiveStatus(s: Suggestion, eventIds: ReadonlySet<string>): SuggestionStatus {
    return s.status === 'kept' && (!s.eventId || !eventIds.has(s.eventId)) ? 'pending' : s.status
}

/** "Find goals again": decisions stay, pending suggestions are replaced, new moments next to a decided one are skipped. */
export function mergeSuggestions(prev: Suggestion[], next: ScoredMoment[], minGapSec: number, makeId: () => string): Suggestion[] {
    const decided = prev.filter((x) => x.status !== 'pending')
    const fresh = next
        .filter((m) => decided.every((d) => Math.abs(d.globalTimeSec - m.timeSec) >= minGapSec / 2))
        .map((m): Suggestion => ({ id: makeId(), globalTimeSec: m.timeSec, score: m.score, source: 'audio', status: 'pending' }))
    return [...decided, ...fresh].sort((a, b) => a.globalTimeSec - b.globalTimeSec)
}

export type ReviewCounts = { total: number; kept: number; rejected: number; pending: number; byType: Partial<Record<KeepType, number>> }

export function reviewCounts(suggestions: Suggestion[], eventIds: ReadonlySet<string>): ReviewCounts {
    const c: ReviewCounts = { total: suggestions.length, kept: 0, rejected: 0, pending: 0, byType: {} }
    for (const s of suggestions) {
        const st = effectiveStatus(s, eventIds)
        if (st === 'kept') { c.kept++; if (s.keptAs) c.byType[s.keptAs] = (c.byType[s.keptAs] ?? 0) + 1 } else if (st === 'rejected') c.rejected++; else c.pending++
    }
    return c
}

/** Pending suggestions as positions on the match strip. */
export function suggestionMarks(suggestions: Suggestion[], eventIds: ReadonlySet<string>, totalSec: number): { id: string; leftPct: number; timeSec: number }[] {
    if (!(totalSec > 0)) return []
    return suggestions.filter((s) => effectiveStatus(s, eventIds) === 'pending')
        .map((s) => ({ id: s.id, leftPct: Math.min(100, Math.max(0, (s.globalTimeSec / totalSec) * 100)), timeSec: s.globalTimeSec }))
}

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

/** Plain text for Copy diagnostics: settings and counts only (no times, no audio). */
export function detectionReport(run: SuggestionRun | null, counts: ReviewCounts): string {
    const types = Object.entries(counts.byType).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')
    return [
        `Find goals (Beta), ${run?.source ?? 'audio'}, config v${run?.configVersion ?? '?'}`,
        `Analysed: ${run ? mmss(run.analysedSec) : '—'}`,
        `Kept ${counts.kept} of ${counts.total}${types ? ` (${types})` : ''}, rejected ${counts.rejected}, not reviewed ${counts.pending}`,
    ].join('\n')
}
```
Run `npx vitest run src/utils/suggestions.test.ts` → PASS.

- [ ] **Step 4: Write failing store tests** — append to `src/state.test.ts` (follow its existing setup/reset helpers; if it resets with `useAppState.setState(...)`, reuse that):
```ts
describe('suggestions', () => {
    const files = [{ id: 'f1', name: 'A.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'A.MP4') }] as unknown as VideoSourceFile[]
    const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
    beforeEach(() => { useAppState.setState({ files, cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null, undoStack: [], redoStack: [], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }] }) })

    it('should keep a suggestion as a goal two seconds before the shout, in one undo step', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const [first] = useAppState.getState().suggestions
        useAppState.getState().decideSuggestion(first.id, { kind: 'keep', type: 'goal', team: 'Whites' })
        const st = useAppState.getState()
        expect(st.events).toHaveLength(1)
        expect(st.events[0]).toMatchObject({ type: 'goal', team: 'Whites', matchTimeSec: 98, sourceFileIndex: 0 })
        expect(st.suggestions[0]).toMatchObject({ status: 'kept', keptAs: 'goal', eventId: st.events[0].id })
        expect(st.undoStack).toHaveLength(1)
    })
    it('should make an undone keep pending again and not duplicate on re-keep', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().undo()
        expect(useAppState.getState().events).toHaveLength(0)
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'save' })
        expect(useAppState.getState().events).toHaveLength(1)
        expect(useAppState.getState().events[0].type).toBe('save')
    })
    it('should remove the kept event when a decision changes to reject', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        expect(useAppState.getState().events).toHaveLength(0)
        expect(useAppState.getState().suggestions[0].status).toBe('rejected')
    })
    it('should keep decisions when finding goals again', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const id = useAppState.getState().suggestions[1].id
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        useAppState.getState().setSuggestions(run, [{ timeSec: 305, score: 9 }, { timeSec: 450, score: 3 }])
        expect(useAppState.getState().suggestions.map((x) => [x.globalTimeSec, x.status])).toEqual([[300, 'rejected'], [450, 'pending']])
    })
    it('should clear suggestions on new match', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        useAppState.getState().newMatch()
        expect(useAppState.getState().suggestions).toEqual([])
        expect(useAppState.getState().suggestionRun).toBeNull()
    })
    it('should migrate v16 state with empty suggestions', () => {
        const migrate = (useAppState as unknown as { persist: { getOptions: () => { migrate: (s: unknown, v: number) => Record<string, unknown> } } }).persist.getOptions().migrate
        const out = migrate({ events: [], teams: [] }, 16)
        expect(out.suggestions).toEqual([])
        expect(out.suggestionRun).toBeNull()
    })
})
```
Run `npx vitest run src/state.test.ts` → FAIL (`setSuggestions` is not a function).

- [ ] **Step 5: Implement the store changes** in `src/state.ts`:
  - Imports: `import type { KeepType, Suggestion, SuggestionRun } from './types'`, `import type { ScoredMoment } from './utils/goalAudioScore'`, `import { mergeSuggestions } from './utils/suggestions'`, `import { globalToFileTime } from './utils/matchStrip'`, `import { AUDIO_DETECT } from './detect/detectConfig'`.
  - `Panel` union: add `| 'review'`.
  - `AppState` additions (with the doc comments):
    ```ts
    /** Suggested moments from Find goals (Beta), with the user's decisions. */
    suggestions: Suggestion[]
    suggestionRun: SuggestionRun | null
    /** Which suggestion the review panel shows (not persisted). */
    reviewIndex: number
    setSuggestions: (run: SuggestionRun, moments: ScoredMoment[]) => void
    decideSuggestion: (id: string, decision: { kind: 'reject' } | { kind: 'keep'; type: KeepType; team?: string }) => void
    clearSuggestions: () => void
    setReviewIndex: (i: number) => void
    openReviewAt: (id: string) => void
    ```
  - Initial values: `suggestions: [], suggestionRun: null, reviewIndex: 0`.
  - Actions:
    ```ts
    setSuggestions: (run, moments) => {
        const id = (): string => `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        set({ suggestions: mergeSuggestions(get().suggestions, moments, AUDIO_DETECT.minGapSec, id), suggestionRun: run, reviewIndex: 0 })
    },
    decideSuggestion: (id, decision) => {
        const st = get()
        const s = st.suggestions.find((x) => x.id === id)
        if (!s) return
        const live = s.eventId && st.events.some((e) => e.id === s.eventId) ? s.eventId : undefined
        if (live) get().removeEvent(live)
        if (decision.kind === 'reject') {
            set({ suggestions: get().suggestions.map((x) => (x.id === id ? { ...x, status: 'rejected', keptAs: undefined, eventId: undefined } : x)) })
            return
        }
        const durations = st.files.map((f) => f.durationSec ?? 0)
        const at = globalToFileTime(st.cumulativeOffsets, durations, Math.max(0, s.globalTimeSec + AUDIO_DETECT.eventOffsetSec))
        const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        get().addEvent({ id: eventId, matchTimeSec: Math.floor(at.timeSec), sourceFileIndex: at.fileIndex, type: decision.type, ...(decision.team ? { team: decision.team } : {}) })
        set({ suggestions: get().suggestions.map((x) => (x.id === id ? { ...x, status: 'kept', keptAs: decision.type, eventId } : x)) })
    },
    clearSuggestions: () => set({ suggestions: [], suggestionRun: null, reviewIndex: 0 }),
    setReviewIndex: (i) => set({ reviewIndex: Math.max(0, i) }),
    openReviewAt: (id) => {
        const i = get().suggestions.findIndex((x) => x.id === id)
        set({ reviewIndex: Math.max(0, i), panel: 'review', picker: null })
    },
    ```
    (Changing keep → reject adds two undo entries — removeEvent then nothing else; keep → keep adds removeEvent + addEvent. Acceptable; note it in the doc comment.)
  - `clear` and `newMatch`: add `suggestions: [], suggestionRun: null, reviewIndex: 0`.
  - `partialize`: add `suggestions: state.suggestions, suggestionRun: state.suggestionRun`.
  - `version: 17`; in `migrate`, before `return state`:
    ```ts
    // Find goals (Beta) suggestions (v17).
    if (version < 17) {
        state.suggestions = Array.isArray(state.suggestions) ? state.suggestions : []
        state.suggestionRun = state.suggestionRun ?? null
    }
    ```
  - `src/components/applyProject.ts`: call `st.clearSuggestions()` right after `st.setEvents(...)` (suggestions belong to the old footage).

- [ ] **Step 6: Run** `npx vitest run src/state.test.ts src/utils/suggestions.test.ts src/components/applyProject.test.ts` → PASS; `npx tsc -b --noEmit` → clean.

- [ ] **Step 7: Commit**
```bash
git add src/utils/suggestions.ts src/utils/suggestions.test.ts src/state.ts src/state.test.ts src/components/applyProject.ts
git commit -m "feat(detect): suggestions in the store (keep/reject, re-run merge, persist v17)"
```

---

### Task 4: Decode, worker and the detection job

**Files:**
- Create: `src/detect/audioSource.ts`, `src/detect/audioFeatures.worker.ts`, `src/detect/featureExtractor.ts`, `src/detect/runAudioDetection.ts`, `src/detect/runAudioDetection.test.ts`, `src/detectJobs.ts`, `src/detectJobs.test.ts`

**Interfaces:**
- Consumes: `FeatureAccumulator`, `downmix`, `AudioFeatures` (Task 1); `placeOnTimeline`, `goalScores`, `pickMoments`, `ScoredMoment` (Task 2); `AUDIO_DETECT` (Task 2); store `setSuggestions` (Task 3); `kickOffSec`, `finalWhistleSec` (`src/utils/matchClock.ts`); `createRenderWakeLock` (`src/renderWakeLock.ts`); `yieldToEventLoop` (`src/render/yield.ts`); `fileSource` (`src/render/fileSource.ts`).
- Produces:
  - `type MonoSink = (mono: Float32Array, sampleRate: number, timeSec: number) => void`
  - `decodeMono(file: File, sink: MonoSink, signal: AbortSignal): Promise<boolean>` — false when the file has no audio track
  - `type FeatureExtractor = { push: (mono: Float32Array, sampleRate: number) => void; finish: () => Promise<AudioFeatures | null>; dispose: () => void }`
  - `createFeatureExtractor(cfg: { hopSec: number; voiceHz: readonly [number, number] }, useWorker?: boolean): FeatureExtractor`
  - `type DetectFile = { file: File; durationSec: number; offsetSec: number }`
  - `type DetectDeps = { decode: typeof decodeMono; extractor: () => FeatureExtractor }`
  - `runAudioDetection(files: DetectFile[], rangeSec: [number, number], deps: DetectDeps, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<{ moments: ScoredMoment[]; scores: Float32Array; analysedSec: number }>`
  - `detectionRange(events: MatchEvent[], offsets: number[], totalSec: number): [number, number]`
  - detection job store: `type DetectPhase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'`;
    `useDetectJob<T>(selector: (s: DetectJobState) => T): T`; `DetectJobState = { phase: DetectPhase; fraction: number; error: string | null; scores: Float32Array | null }`;
    `startDetection(): void`; `cancelDetection(): void`; `createDetectJobs(deps?: Partial<JobDeps>)` for tests.

- [ ] **Step 1: Write failing tests** — `src/detect/runAudioDetection.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectionRange, runAudioDetection, type DetectDeps } from './runAudioDetection'
import { createFeatureExtractor } from './featureExtractor'
import type { MatchEvent } from '../types'

const SR = 8000
/** Fake decoder: background noise with a shout + hush at `shoutAt` seconds (per file); no audio when shoutAt is null. */
function fakeDecode(plan: Map<File, { sec: number; shoutAt: number | null } | null>): DetectDeps['decode'] {
    return async (file, sink) => {
        const p = plan.get(file)
        if (!p) return false
        let seed = 3
        const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }
        const chunk = SR // 1 s chunks
        for (let s = 0; s < p.sec; s++) {
            const a = new Float32Array(chunk)
            const shout = p.shoutAt !== null && s >= p.shoutAt && s < p.shoutAt + 2
            const hush = p.shoutAt !== null && s >= p.shoutAt + 5 && s < p.shoutAt + 15
            for (let i = 0; i < chunk; i++) a[i] = rnd() * (hush ? 0.02 : 0.1) + (shout ? 0.6 * Math.sin((2 * Math.PI * 900 * i) / SR) : 0)
            sink(a, SR, s)
        }
        return true
    }
}
const deps = (plan: Map<File, { sec: number; shoutAt: number | null } | null>): DetectDeps =>
    ({ decode: fakeDecode(plan), extractor: () => createFeatureExtractor({ hopSec: 0.2, voiceHz: [300, 3000] }, false) })

describe('runAudioDetection', () => {
    it('should find a shout in the second file at its timeline position', async () => {
        const a = new File([], 'a'), b = new File([], 'b')
        const plan = new Map([[a, { sec: 120, shoutAt: null }], [b, { sec: 120, shoutAt: 60 }]])
        const progress: number[] = []
        const r = await runAudioDetection([{ file: a, durationSec: 120, offsetSec: 0 }, { file: b, durationSec: 120, offsetSec: 120 }], [0, 240], deps(plan), new AbortController().signal, (f) => progress.push(f))
        expect(Math.abs(r.moments.sort((x, y) => y.score - x.score)[0].timeSec - 180)).toBeLessThanOrEqual(4)
        expect(progress.at(-1)).toBe(1)
        expect(r.analysedSec).toBe(240)
    })
    it('should skip a file without audio and still analyse the others', async () => {
        const a = new File([], 'a'), b = new File([], 'b')
        const plan = new Map<File, { sec: number; shoutAt: number | null } | null>([[a, null], [b, { sec: 120, shoutAt: 40 }]])
        const r = await runAudioDetection([{ file: a, durationSec: 120, offsetSec: 0 }, { file: b, durationSec: 120, offsetSec: 120 }], [0, 240], deps(plan), new AbortController().signal, () => {})
        expect(r.moments.length).toBeGreaterThan(0)
        expect(r.moments.every((m) => m.timeSec >= 120)).toBe(true)
    })
    it('should stop when cancelled', async () => {
        const a = new File([], 'a'); const ac = new AbortController(); ac.abort()
        await expect(runAudioDetection([{ file: a, durationSec: 60, offsetSec: 0 }], [0, 60], deps(new Map([[a, { sec: 60, shoutAt: 10 }]])), ac.signal, () => {})).rejects.toThrow(/cancel/i)
    })
})

describe('detectionRange', () => {
    const ev = (type: MatchEvent['type'], t: number): MatchEvent => ({ id: type, type, matchTimeSec: t, sourceFileIndex: 0 })
    it('should use kick off and final whistle when both are set in order', () => {
        expect(detectionRange([ev('kick_off', 60), ev('final_whistle', 3000)], [0], 3600)).toEqual([60, 3000])
    })
    it('should use the whole timeline without markers or when they are out of order', () => {
        expect(detectionRange([], [0], 3600)).toEqual([0, 3600])
        expect(detectionRange([ev('kick_off', 900), ev('final_whistle', 100)], [0], 3600)).toEqual([0, 3600])
    })
})
```
`src/detectJobs.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createDetectJobs } from './detectJobs'
import { useAppState } from './state'

describe('detection job', () => {
    it('should run, write suggestions, hold and release the wake lock', async () => {
        const wake = { acquire: vi.fn(async () => {}), release: vi.fn(async () => {}), status: () => 'held' }
        const run = vi.fn(async () => ({ moments: [{ timeSec: 100, score: 3 }], scores: new Float32Array(3), analysedSec: 600 }))
        useAppState.setState({ files: [{ id: 'f', name: 'A', url: '', kind: 'full', durationSec: 600, file: new File([], 'A') }] as never, cumulativeOffsets: [0], events: [], suggestions: [] })
        const jobs = createDetectJobs({ run, wakeLock: () => wake, now: () => 5 })
        await jobs.start()
        expect(jobs.store.getState().phase).toBe('done')
        expect(useAppState.getState().suggestions.map((s) => s.globalTimeSec)).toEqual([100])
        expect(useAppState.getState().suggestionRun).toMatchObject({ analysedSec: 600, total: 1, configVersion: 1 })
        expect(wake.acquire).toHaveBeenCalled(); expect(wake.release).toHaveBeenCalled()
    })
    it('should keep previous suggestions when cancelled', async () => {
        useAppState.setState({ suggestions: [{ id: 'old', globalTimeSec: 50, score: 1, source: 'audio', status: 'pending' }] })
        const run = vi.fn((_f, _r, _d, signal: AbortSignal) => new Promise<never>((_, rej) => signal.addEventListener('abort', () => rej(new Error('cancelled')))))
        const jobs = createDetectJobs({ run: run as never, wakeLock: () => ({ acquire: async () => {}, release: async () => {}, status: () => '' }), now: () => 0 })
        const p = jobs.start(); jobs.cancel(); await p
        expect(jobs.store.getState().phase).toBe('cancelled')
        expect(useAppState.getState().suggestions.map((s) => s.id)).toEqual(['old'])
    })
    it('should report a failure in plain words', async () => {
        const jobs = createDetectJobs({ run: vi.fn(async () => { throw new Error('no decoder for this audio') }), wakeLock: () => ({ acquire: async () => {}, release: async () => {}, status: () => '' }), now: () => 0 })
        await jobs.start()
        expect(jobs.store.getState()).toMatchObject({ phase: 'failed', error: 'no decoder for this audio' })
    })
})
```
Run: `npx vitest run src/detect src/detectJobs.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Implement `src/detect/audioSource.ts`** (engine boundary; covered by the real-footage check in Task 7):
```ts
import { ALL_FORMATS, AudioSampleSink, Input } from 'mediabunny'
import { fileSource } from '../render/fileSource'
import { yieldToEventLoop } from '../render/yield'
import { downmix } from '../utils/audioFeatures'

export type MonoSink = (mono: Float32Array, sampleRate: number, timeSec: number) => void

/** Decodes a file's first audio track to mono chunks (via fileSource block reads). False when there is no audio track. */
export async function decodeMono(file: File, sink: MonoSink, signal: AbortSignal): Promise<boolean> {
    const input = new Input({ source: fileSource(file), formats: ALL_FORMATS })
    try {
        const track = await input.getPrimaryAudioTrack()
        if (!track) return false
        let n = 0
        for await (const s of new AudioSampleSink(track).samples()) {
            try {
                if (signal.aborted) throw new Error('Cancelled')
                const ch = s.numberOfChannels
                const buf = new Float32Array(s.numberOfFrames * ch)
                s.copyTo(buf, { planeIndex: 0, format: 'f32' })
                sink(downmix(buf, ch), s.sampleRate, s.timestamp)
            } finally {
                s.close()
            }
            if (++n % 50 === 0) await yieldToEventLoop()
        }
        return true
    } finally {
        input.dispose?.()
    }
}
```
(If `input.dispose` does not exist in this Mediabunny version, remove that line; check `node_modules/mediabunny/dist/mediabunny.d.ts`.)

- [ ] **Step 3: Implement the worker and client**

`src/detect/audioFeatures.worker.ts`:
```ts
import { FeatureAccumulator } from '../utils/audioFeatures'

type In = { type: 'start'; sampleRate: number; hopSec: number; voiceHz: [number, number] } | { type: 'chunk'; data: Float32Array } | { type: 'end' }
let acc: FeatureAccumulator | null = null
self.onmessage = (e: MessageEvent<In>): void => {
    const m = e.data
    if (m.type === 'start') acc = new FeatureAccumulator(m.sampleRate, m.hopSec, m.voiceHz)
    else if (m.type === 'chunk') acc?.push(m.data)
    else {
        const f = acc?.finish() ?? null
        if (f) (self as unknown as Worker).postMessage({ loudDb: f.loudDb, voiceDb: f.voiceDb, hopSec: f.hopSec }, [f.loudDb.buffer, f.voiceDb.buffer])
        else (self as unknown as Worker).postMessage(null)
        acc = null
    }
}
```

`src/detect/featureExtractor.ts`:
```ts
import { FeatureAccumulator, type AudioFeatures } from '../utils/audioFeatures'

export type FeatureExtractor = { push: (mono: Float32Array, sampleRate: number) => void; finish: () => Promise<AudioFeatures | null>; dispose: () => void }

/** Audio features for one file, in a Web Worker when available (chunks are transferred), else on this thread. */
export function createFeatureExtractor(cfg: { hopSec: number; voiceHz: readonly [number, number] }, useWorker = typeof Worker !== 'undefined'): FeatureExtractor {
    if (!useWorker) {
        let acc: FeatureAccumulator | null = null
        return {
            push: (mono, sr) => { (acc ??= new FeatureAccumulator(sr, cfg.hopSec, cfg.voiceHz)).push(mono) },
            finish: async () => acc?.finish() ?? null,
            dispose: () => { acc = null },
        }
    }
    const worker = new Worker(new URL('./audioFeatures.worker.ts', import.meta.url), { type: 'module' })
    let started = false
    return {
        push: (mono, sr) => {
            if (!started) { worker.postMessage({ type: 'start', sampleRate: sr, hopSec: cfg.hopSec, voiceHz: [...cfg.voiceHz] }); started = true }
            worker.postMessage({ type: 'chunk', data: mono }, [mono.buffer])
        },
        finish: () => new Promise((resolve, reject) => {
            if (!started) { resolve(null); return }
            worker.onmessage = (e: MessageEvent<AudioFeatures | null>) => resolve(e.data)
            worker.onerror = (e) => reject(new Error(e.message || 'Audio analysis failed'))
            worker.postMessage({ type: 'end' })
        }),
        dispose: () => worker.terminate(),
    }
}
```

- [ ] **Step 4: Implement `src/detect/runAudioDetection.ts`**
```ts
import { AUDIO_DETECT } from './detectConfig'
import { decodeMono } from './audioSource'
import { createFeatureExtractor, type FeatureExtractor } from './featureExtractor'
import { goalScores, pickMoments, placeOnTimeline, type ScoredMoment } from '../utils/goalAudioScore'
import { finalWhistleSec, kickOffSec } from '../utils/matchClock'
import type { AudioFeatures } from '../utils/audioFeatures'
import type { MatchEvent } from '../types'

export type DetectFile = { file: File; durationSec: number; offsetSec: number }
export type DetectDeps = { decode: typeof decodeMono; extractor: () => FeatureExtractor }
export const defaultDetectDeps: DetectDeps = { decode: decodeMono, extractor: () => createFeatureExtractor(AUDIO_DETECT) }

/** Kick off → Final whistle when both are set and in order, else the whole timeline. */
export function detectionRange(events: MatchEvent[], offsets: number[], totalSec: number): [number, number] {
    const ko = kickOffSec(events, offsets), fw = finalWhistleSec(events, offsets)
    if (fw !== null && fw > ko) return [ko, fw]
    if (fw === null && ko > 0 && ko < totalSec) return [ko, totalSec]
    return [0, totalSec]
}

/** Decode each file's audio, extract features, score the whole timeline and pick moments inside `rangeSec`. */
export async function runAudioDetection(files: DetectFile[], rangeSec: [number, number], deps: DetectDeps, signal: AbortSignal,
    onProgress: (fraction: number) => void): Promise<{ moments: ScoredMoment[]; scores: Float32Array; analysedSec: number }> {
    const totalSec = files.reduce((s, f) => s + f.durationSec, 0)
    const parts: { features: AudioFeatures; offsetSec: number }[] = []
    let done = 0
    for (const f of files) {
        if (signal.aborted) throw new Error('Cancelled')
        if (f.offsetSec + f.durationSec <= rangeSec[0] || f.offsetSec >= rangeSec[1]) { done += f.durationSec; continue }
        const ex = deps.extractor()
        try {
            const hasAudio = await deps.decode(f.file, (mono, sr, t) => { ex.push(mono, sr); onProgress(Math.min(0.99, (done + t) / Math.max(1, totalSec))) }, signal)
            const feats = hasAudio ? await ex.finish() : null
            if (feats) parts.push({ features: feats, offsetSec: f.offsetSec })
        } finally {
            ex.dispose()
        }
        if (signal.aborted) throw new Error('Cancelled')
        done += f.durationSec
    }
    const timeline = placeOnTimeline(parts, totalSec, AUDIO_DETECT.hopSec)
    const scores = goalScores(timeline, AUDIO_DETECT)
    const moments = parts.length === 0 ? [] : pickMoments(scores, AUDIO_DETECT.hopSec,
        { minGapSec: AUDIO_DETECT.minGapSec, max: AUDIO_DETECT.maxSuggestions, startSec: rangeSec[0], endSec: rangeSec[1] })
    onProgress(1)
    return { moments, scores, analysedSec: Math.round(rangeSec[1] - rangeSec[0]) }
}
```

- [ ] **Step 5: Implement `src/detectJobs.ts`**
```ts
// The one Find goals (Beta) analysis, kept outside the UI like renderJobs.ts: closing the review panel never stops it.
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useAppState } from './state'
import { AUDIO_DETECT } from './detect/detectConfig'
import { defaultDetectDeps, detectionRange, runAudioDetection } from './detect/runAudioDetection'
import { createRenderWakeLock, type RenderWakeLock } from './renderWakeLock'

export type DetectPhase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'
export type DetectJobState = { phase: DetectPhase; fraction: number; error: string | null; scores: Float32Array | null }
type JobDeps = { run: typeof runAudioDetection; wakeLock: () => RenderWakeLock; now: () => number }

export function createDetectJobs(over: Partial<JobDeps> = {}): { store: StoreApi<DetectJobState>; start: () => Promise<void>; cancel: () => void } {
    const deps: JobDeps = { run: runAudioDetection, wakeLock: createRenderWakeLock, now: () => Date.now(), ...over }
    const store = createStore<DetectJobState>(() => ({ phase: 'idle', fraction: 0, error: null, scores: null }))
    let ac: AbortController | null = null
    const start = async (): Promise<void> => {
        if (store.getState().phase === 'running') return
        const app = useAppState.getState()
        const files = app.files.map((f, i) => ({ file: f.file, durationSec: f.durationSec ?? 0, offsetSec: app.cumulativeOffsets[i] ?? 0 }))
        const totalSec = files.reduce((s, f) => s + f.durationSec, 0)
        const range = detectionRange(app.events, app.cumulativeOffsets, totalSec)
        ac = new AbortController()
        const lock = deps.wakeLock()
        store.setState({ phase: 'running', fraction: 0, error: null })
        await lock.acquire().catch(() => {})
        try {
            const r = await deps.run(files, range, defaultDetectDeps, ac.signal, (fraction) => store.setState({ fraction }))
            useAppState.getState().setSuggestions({ createdAt: deps.now(), source: 'audio', configVersion: AUDIO_DETECT.version, analysedSec: r.analysedSec, total: r.moments.length }, r.moments)
            store.setState({ phase: 'done', fraction: 1, scores: r.scores })
        } catch (e) {
            const cancelled = ac.signal.aborted
            store.setState({ phase: cancelled ? 'cancelled' : 'failed', error: cancelled ? null : e instanceof Error ? e.message : String(e) })
        } finally {
            await lock.release().catch(() => {})
            ac = null
        }
    }
    return { store, start, cancel: () => ac?.abort() }
}

const jobs = createDetectJobs()
export const startDetection = (): void => { void jobs.start() }
export const cancelDetection = (): void => jobs.cancel()
export function useDetectJob<T>(selector: (s: DetectJobState) => T): T { return useStore(jobs.store, selector) }
export const getDetectJob = (): DetectJobState => jobs.store.getState()
```
Note: the injected `run` receives `defaultDetectDeps` but tests replace `run` entirely, so no decoding happens in tests.

- [ ] **Step 6: Run** `npx vitest run src/detect src/detectJobs.test.ts` → PASS; `npx tsc -b --noEmit` → clean; `npm run build` → succeeds and the build output contains a separate worker chunk (`ls dist/assets | grep -i worker`).

- [ ] **Step 7: Commit**
```bash
git add src/detect src/detectJobs.ts src/detectJobs.test.ts
git commit -m "feat(detect): audio decode, feature worker and the Find goals job"
```

---

### Task 5: Review panel, menu entry, empty state, copy

**Files:**
- Create: `src/components/BetaTag.tsx`, `src/components/useReviewLoop.ts`, `src/components/DetectProgress.tsx`, `src/components/SuggestionCard.tsx`, `src/components/SuggestionSummary.tsx`, `src/components/SuggestionReview.tsx`, `src/components/SuggestionReview.test.tsx`
- Modify: `src/utils/voice.ts` (+ `voice.test.ts`), `src/components/Panels.tsx`, `src/components/OverflowMenu.tsx` (+ test), `src/components/EventLog.tsx` (+ test), `src/App.css`

**Interfaces:**
- Consumes: store (Task 3): `suggestions`, `suggestionRun`, `reviewIndex`, `decideSuggestion`, `setReviewIndex`, `clearSuggestions`, `teams`, `events`, `files`, `cumulativeOffsets`, `seekToGoal`, `currentFileIndex`, `currentTimeInFileSec`, `openPanel`, `closePanel`; job (Task 4): `useDetectJob`, `startDetection`, `cancelDetection`, `getDetectJob`; utils (Task 3): `effectiveStatus`, `reviewCounts`, `detectionReport`; `AUDIO_DETECT`; `ColumnPanel`; `globalToFileTime`; `formatEventClock`/`selectMatchStartSec`/`selectClockLong` for the clock label.
- Produces: `listeningLine(fraction: number): string`, `keptSummary(kept: number, total: number): string`, `LOW_KEEP_NOTE`, `NOTHING_STOOD_OUT` in `voice.ts`; `<SuggestionReview onClose />`; `<BetaTag />`; `findGoals(): void` helper exported from `SuggestionReview.tsx`? — no: put `openFindGoals(): void` in `src/detectJobs.ts`'s neighbour `src/components/findGoals.ts`:
  ```ts
  import { useAppState } from '../state'
  import { getDetectJob, startDetection } from '../detectJobs'
  /** Menu / empty state: start the analysis unless there is something to review (or it is already running), then open the panel. */
  export function openFindGoals(again = false): void {
      const st = useAppState.getState()
      if (again || (st.suggestions.length === 0 && getDetectJob().phase !== 'running')) startDetection()
      st.openPanel('review')
  }
  ```
  (add `src/components/findGoals.ts` to this task's files).

- [ ] **Step 1: Voice lines (TDD)** — add to `src/utils/voice.test.ts`:
```ts
describe('find goals lines', () => {
    it('should show progress in the brand voice', () => { expect(listeningLine(0.4)).toBe('Listening for the roar… 40%') })
    it('should summarise kept suggestions', () => { expect(keptSummary(6, 22)).toBe('You kept 6 of 22.') })
})
```
Run → FAIL. Implement in `src/utils/voice.ts`:
```ts
/** Find goals (Beta) progress (brand voice). */
export function listeningLine(fraction: number): string { return `Listening for the roar… ${pct(fraction)}%` }
export function keptSummary(kept: number, total: number): string { return `You kept ${kept} of ${total}.` }
export const LOW_KEEP_NOTE = 'Detection struggled on this footage. Copy diagnostics and send it over.'
export const NOTHING_STOOD_OUT = 'Nothing stood out in the audio. Tag goals as you watch.'
```
Run → PASS.

- [ ] **Step 2: Write the failing component tests** — `src/components/SuggestionReview.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'

vi.mock('../detectJobs', () => ({
    useDetectJob: (sel: (s: { phase: string; fraction: number; error: string | null; scores: null }) => unknown) => sel({ phase: 'done', fraction: 1, error: null, scores: null }),
    startDetection: vi.fn(), cancelDetection: vi.fn(), getDetectJob: () => ({ phase: 'done' }),
}))
import { SuggestionReview } from './SuggestionReview'

const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
beforeEach(() => {
    useAppState.setState({
        files: [{ id: 'f', name: 'A.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'A.MP4') }] as never,
        cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null, reviewIndex: 0, panel: 'review',
        teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }],
    })
    useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
})

describe('SuggestionReview', () => {
    it('should show the first suggestion with a Beta tag', () => {
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('Beta')).toBeTruthy()
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
    it('should keep a goal for the chosen team with G then 2, and move on', () => {
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: 'g' }) })
        expect(screen.getByRole('button', { name: /Colours/ })).toBeTruthy()
        act(() => { fireEvent.keyDown(window, { key: '2' }) })
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Colours' })
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
    })
    it('should reject with X and show the summary at the end', () => {
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: 'x' }) })
        act(() => { fireEvent.keyDown(window, { key: 's' }) })
        expect(screen.getByText('You kept 1 of 2.')).toBeTruthy()
    })
    it('should warn when very few were kept', () => {
        useAppState.getState().setSuggestions(run, Array.from({ length: 10 }, (_, i) => ({ timeSec: 30 + i * 40, score: 1 })))
        render(<SuggestionReview onClose={() => {}} />)
        for (let i = 0; i < 10; i++) act(() => { fireEvent.keyDown(window, { key: 'x' }) })
        expect(screen.getByText('Detection struggled on this footage. Copy diagnostics and send it over.')).toBeTruthy()
    })
    it('should say nothing stood out when there are no suggestions', () => {
        useAppState.setState({ suggestions: [], suggestionRun: { ...run, total: 0 } })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('Nothing stood out in the audio. Tag goals as you watch.')).toBeTruthy()
        expect(screen.queryByText(/You kept 0 of 0/)).toBeNull()
    })
    it('should offer touch buttons of at least the goal action', () => {
        render(<SuggestionReview onClose={() => {}} />)
        fireEvent.click(screen.getByRole('button', { name: /^Goal/ }))
        fireEvent.click(screen.getByRole('button', { name: /Whites/ }))
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Whites' })
    })
})
```
Also add to `OverflowMenu.test.tsx`: menu shows "Find goals" with "Beta" when there are no suggestions and "Review suggestions" when there are; to `EventLog.test.tsx`: empty state with files loaded shows a "Find goals" button; with no files it does not. Run → FAIL.

- [ ] **Step 3: Implement the components**

`src/components/BetaTag.tsx`:
```tsx
/** Small chalk tag for features still being tried out. */
export function BetaTag() {
    return <span className="beta-tag">Beta</span>
}
```

`src/components/useReviewLoop.ts`:
```ts
import { useEffect } from 'react'
import { useAppState } from '../state'
import { globalToFileTime } from '../utils/matchStrip'
import { AUDIO_DETECT } from '../detect/detectConfig'

/** Plays [t − 8 s, t + 4 s] around the suggestion at `timeSec` (whole timeline) and jumps back to its start at the end. */
export function useReviewLoop(timeSec: number | null): void {
    useEffect(() => {
        if (timeSec === null) return
        const st = useAppState.getState()
        const durations = st.files.map((f) => f.durationSec ?? 0)
        const startAbs = Math.max(0, timeSec + AUDIO_DETECT.reviewWindowSec[0]), endAbs = timeSec + AUDIO_DETECT.reviewWindowSec[1]
        const start = globalToFileTime(st.cumulativeOffsets, durations, startAbs)
        st.seekToGoal(start.fileIndex, start.timeSec)
        return useAppState.subscribe((s, prev) => {
            if (s.currentTimeInFileSec === prev.currentTimeInFileSec && s.currentFileIndex === prev.currentFileIndex) return
            const now = (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec
            if (now >= endAbs) s.seekToGoal(start.fileIndex, start.timeSec)
        })
    }, [timeSec])
}
```

`src/components/DetectProgress.tsx`:
```tsx
import { cancelDetection, startDetection, useDetectJob } from '../detectJobs'
import { listeningLine } from '../utils/voice'

/** Find goals while it runs, or why it failed. */
export function DetectProgress() {
    const phase = useDetectJob((s) => s.phase)
    const fraction = useDetectJob((s) => s.fraction)
    const error = useDetectJob((s) => s.error)
    if (phase === 'failed') {
        return (
            <div className="review__status" role="alert">
                <p className="m-0">Couldn't read the audio: {error}</p>
                <button type="button" className="btn-quiet" onClick={() => startDetection()}>Try again</button>
            </div>
        )
    }
    return (
        <div className="review__status" role="status" aria-live="polite">
            <p className="m-0">{listeningLine(fraction)}</p>
            <div className="review__bar" aria-hidden="true"><div style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
            <button type="button" className="btn-quiet" onClick={() => cancelDetection()}>Cancel</button>
        </div>
    )
}
```

`src/components/SuggestionCard.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { KeepType, Suggestion } from '../types'
import { formatClock } from '../utils/timeline'
import { useReviewLoop } from './useReviewLoop'

interface SuggestionCardProps {
    suggestion: Suggestion
    index: number
    total: number
    onNext: () => void
    onPrev: () => void
}

const ACTIONS: { type: KeepType | 'reject'; label: string; key: string }[] = [
    { type: 'goal', label: 'Goal', key: 'G' }, { type: 'own_goal', label: 'Own goal', key: 'O' },
    { type: 'save', label: 'Save', key: 'S' }, { type: 'highlight', label: 'Highlight', key: 'H' },
    { type: 'reject', label: 'Not a goal', key: 'X' },
]

/** One suggested moment: the player loops around it; a key or button decides it (goals and own goals then ask for the team). */
export function SuggestionCard({ suggestion, index, total, onNext, onPrev }: SuggestionCardProps) {
    const teams = useAppState((s) => s.teams)
    const kickOff = useAppState(selectMatchStartSec)
    const long = useAppState(selectClockLong)
    const [needTeam, setNeedTeam] = useState<KeepType | null>(null)
    useReviewLoop(suggestion.globalTimeSec)
    useEffect(() => setNeedTeam(null), [suggestion.id])

    const decide = (type: KeepType | 'reject', team?: string): void => {
        const st = useAppState.getState()
        if (type === 'reject') st.decideSuggestion(suggestion.id, { kind: 'reject' })
        else st.decideSuggestion(suggestion.id, { kind: 'keep', type, ...(team ? { team } : {}) })
        setNeedTeam(null)
        onNext()
    }
    const choose = (type: KeepType | 'reject'): void => {
        if ((type === 'goal' || type === 'own_goal') && teams.length >= 2) setNeedTeam(type)
        else decide(type)
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if ((e.target as HTMLElement | null)?.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
            const k = e.key.toLowerCase()
            if (needTeam && (k === '1' || k === '2')) { e.preventDefault(); decide(needTeam, teams[Number(k) - 1]?.name); return }
            const a = ACTIONS.find((x) => x.key.toLowerCase() === k)
            if (a) { e.preventDefault(); choose(a.type); return }
            if (e.key === 'ArrowRight') { e.preventDefault(); onNext() }
            if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    return (
        <div className="review__card">
            <p className="review__count tc">Suggestion {index + 1} of {total} · <span className="clock">{formatClock(Math.max(0, suggestion.globalTimeSec - kickOff), long)}</span></p>
            {needTeam ? (
                <div className="review__actions" role="group" aria-label="Which team scored?">
                    {teams.slice(0, 2).map((t, i) => (
                        <button key={t.name} type="button" className="btn-quiet review__btn" onClick={() => decide(needTeam, t.name)}>
                            {t.name} <kbd>{i + 1}</kbd>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="review__actions" role="group" aria-label="What is it?">
                    {ACTIONS.map((a) => (
                        <button key={a.type} type="button" className={`${a.type === 'goal' ? 'btn-primary' : 'btn-quiet'} review__btn`} onClick={() => choose(a.type)}>
                            {a.label} <kbd>{a.key}</kbd>
                        </button>
                    ))}
                </div>
            )}
            <div className="review__nav">
                <button type="button" className="btn-quiet review__btn" onClick={onPrev} disabled={index === 0}>← Previous</button>
                <button type="button" className="btn-quiet review__btn" onClick={onNext}>Skip →</button>
            </div>
        </div>
    )
}
```
(Check `formatClock` signature in `src/utils/timeline.ts`; if it differs, use the same formatter `MatchStrip` uses for its time bubble.)

`src/components/SuggestionSummary.tsx`:
```tsx
import { useAppState } from '../state'
import { AUDIO_DETECT } from '../detect/detectConfig'
import { getDetectJob } from '../detectJobs'
import { detectionReport, reviewCounts } from '../utils/suggestions'
import { keptSummary, LOW_KEEP_NOTE, NOTHING_STOOD_OUT } from '../utils/voice'
import { openFindGoals } from './findGoals'

interface SuggestionSummaryProps { onClose: () => void }

const showDevTools = (): boolean => import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'))

/** After the review: how many were kept, a health note when very few were, diagnostics and running it again. */
export function SuggestionSummary({ onClose }: SuggestionSummaryProps) {
    const suggestions = useAppState((s) => s.suggestions)
    const run = useAppState((s) => s.suggestionRun)
    const events = useAppState((s) => s.events)
    const counts = reviewCounts(suggestions, new Set(events.map((e) => e.id)))
    const copy = (text: string): void => { void navigator.clipboard?.writeText(text) }
    return (
        <div className="review__summary">
            {counts.total === 0 ? <p className="m-0">{NOTHING_STOOD_OUT}</p> : <p className="m-0 review__kept">{keptSummary(counts.kept, counts.total)}</p>}
            {counts.total >= 5 && counts.kept / counts.total < AUDIO_DETECT.lowKeepRatio && <p className="m-0 review__note">{LOW_KEEP_NOTE}</p>}
            <div className="review__nav">
                <button type="button" className="btn-quiet review__btn" onClick={() => copy(detectionReport(run, counts))}>Copy diagnostics</button>
                {showDevTools() && (
                    <button type="button" className="btn-quiet review__btn" onClick={() => {
                        const sc = getDetectJob().scores
                        copy(JSON.stringify({ hopSec: AUDIO_DETECT.hopSec, scores: sc ? Array.from(sc, (v) => Math.round(v * 100) / 100) : [] }))
                    }}>Copy scores</button>
                )}
                <button type="button" className="btn-quiet review__btn" onClick={() => openFindGoals(true)}>Find goals again</button>
                <button type="button" className="btn-primary review__btn" onClick={onClose}>Done</button>
            </div>
        </div>
    )
}
```
Note: "Done" is the panel's primary action and uses `btn-primary` (allowed lime use). If a reviewer objects to two lime buttons at once (Goal is not visible on the summary), keep it.

`src/components/SuggestionReview.tsx`:
```tsx
import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { effectiveStatus } from '../utils/suggestions'
import { BetaTag } from './BetaTag'
import { ColumnPanel } from './ColumnPanel'
import { DetectProgress } from './DetectProgress'
import { SuggestionCard } from './SuggestionCard'
import { SuggestionSummary } from './SuggestionSummary'

interface SuggestionReviewProps { onClose: () => void }

/** Find goals (Beta): progress while listening, then one suggestion at a time, then the summary. */
export function SuggestionReview({ onClose }: SuggestionReviewProps) {
    const phase = useDetectJob((s) => s.phase)
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const index = useAppState((s) => s.reviewIndex)
    const ids = new Set(events.map((e) => e.id))
    const nextPending = (from: number): number => {
        for (let i = from; i < suggestions.length; i++) if (effectiveStatus(suggestions[i], ids) === 'pending') return i
        return suggestions.length
    }
    const current = index < suggestions.length ? suggestions[index] : null
    const go = (i: number): void => useAppState.getState().setReviewIndex(i)
    const busy = phase === 'running' || phase === 'failed'
    return (
        <ColumnPanel label="Suggested goals" onClose={onClose} className="review">
            <h2 className="review__title">Suggested goals <BetaTag /></h2>
            {busy ? <DetectProgress /> : current
                ? <SuggestionCard suggestion={current} index={index} total={suggestions.length}
                    onNext={() => go(nextPending(index + 1))} onPrev={() => go(Math.max(0, index - 1))} />
                : <SuggestionSummary onClose={onClose} />}
        </ColumnPanel>
    )
}
```
Note on `onNext` after a decision: `decideSuggestion` updates the store before `onNext` runs, but this render's `suggestions`/`ids` are stale; `nextPending(index + 1)` only looks forward, so stale status of the current item does not matter.

`src/components/Panels.tsx`: add `case 'review': return <SuggestionReview onClose={close} />`.

`src/components/OverflowMenu.tsx` (`MenuBody`): read `const hasSuggestions = useAppState((s) => s.suggestions.length > 0)` and `const hasFiles = useAppState((s) => s.files.length > 0)`; after "New match…" add:
```tsx
{hasFiles && (
    <button type="button" role="menuitem" onClick={() => openFindGoals()}>
        {hasSuggestions ? 'Review suggestions' : 'Find goals'} <BetaTag />
    </button>
)}
```

`src/components/EventLog.tsx`: in the empty state (where `emptyLogLine` is rendered), when `files.length > 0`, add below the hint:
```tsx
<button type="button" className="btn-quiet empty-log__find" onClick={() => openFindGoals()}>Find goals <BetaTag /></button>
```

`src/App.css` (tokens only; no lime):
```css
.beta-tag { display: inline-block; margin-left: 6px; padding: 1px 6px; border: 1px solid var(--sh-line); border-radius: 4px;
  font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--sh-muted); vertical-align: middle; }
.review { display: flex; flex-direction: column; gap: 12px; }
.review__title { margin: 0; font-size: 16px; }
.review__count { margin: 0; color: var(--sh-muted); }
.review__actions, .review__nav { display: flex; flex-wrap: wrap; gap: 8px; }
.review__btn { min-height: 44px; }
.review__btn kbd { margin-left: 6px; font-family: var(--sh-font-mono, ui-monospace); font-size: 12px; opacity: .7; }
.review__status { display: flex; flex-direction: column; gap: 8px; }
.review__bar { height: 4px; background: var(--sh-line); border-radius: 2px; overflow: hidden; }
.review__bar > div { height: 100%; background: var(--sh-text); transition: width .2s; }
@media (prefers-reduced-motion: reduce) { .review__bar > div { transition: none; } }
.review__kept { font-size: 18px; font-weight: 700; }
.review__note { color: var(--sh-muted); }
@media (pointer: coarse) { .review { font-size: 15px; } }
```
(Check token names against `src/index.css` — use the same mono font variable the clocks use.)

- [ ] **Step 4: Run** `npx vitest run src/components/SuggestionReview.test.tsx src/components/OverflowMenu.test.tsx src/components/EventLog.test.tsx src/utils/voice.test.ts src/utils/limeUsage.test.ts` → PASS. Then `npm run test:run` (all) → PASS; `npx tsc -b --noEmit`; `npm run lint` (no new problems).

- [ ] **Step 5: Commit**
```bash
git add src/components src/utils/voice.ts src/utils/voice.test.ts src/App.css
git commit -m "feat(detect): Find goals (Beta) review panel, menu entry and empty-state button"
```

---

### Task 6: Pending suggestions on the match strip

**Files:**
- Modify: `src/components/MatchStrip.tsx`, `src/components/MatchStrip.test.tsx`, `src/App.css`

**Interfaces:**
- Consumes: `suggestionMarks` (Task 3), store `suggestions`, `events`, `openReviewAt` (Task 3).

- [ ] **Step 1: Failing test** — add to `src/components/MatchStrip.test.tsx` (reuse its setup with loaded files of known duration):
```tsx
it('should show pending suggestions as rings that open the review', () => {
    useAppState.setState({ suggestions: [
        { id: 's1', globalTimeSec: 120, score: 1, source: 'audio', status: 'pending' },
        { id: 's2', globalTimeSec: 240, score: 1, source: 'audio', status: 'rejected' },
    ] })
    render(<MatchStrip />)
    const rings = screen.getAllByRole('button', { name: /Suggested moment/ })
    expect(rings).toHaveLength(1)
    fireEvent.click(rings[0])
    expect(useAppState.getState().panel).toBe('review')
})
```
Run → FAIL.

- [ ] **Step 2: Implement** — in `MatchStrip`, read `const suggestions = useAppState((s) => s.suggestions)`, compute
`const marks = useMemo(() => suggestionMarks(suggestions, new Set(events.map((e) => e.id)), strip.totalSec), [suggestions, events, strip.totalSec])`,
and render inside the track, before the event icons:
```tsx
{marks.map((m) => (
    <button key={m.id} type="button" className="strip-suggestion" style={{ left: `${m.leftPct}%` }}
        aria-label={`Suggested moment at ${formatEventClock(m.timeSec, m.timeSec, matchStartSec, clockLong)}`}
        onClick={() => useAppState.getState().openReviewAt(m.id)} />
))}
```
(The track's `onPointerDown` already ignores pointer-downs that start on a `button`.) CSS:
```css
.strip-suggestion { position: absolute; bottom: 2px; width: 12px; height: 12px; margin-left: -6px; padding: 0; border-radius: 50%;
  border: 2px solid var(--sh-text); background: transparent; opacity: .8; cursor: pointer; }
.strip-suggestion::after { content: ''; position: absolute; inset: -16px; } /* 44 px touch target */
```

- [ ] **Step 3: Run** `npx vitest run src/components/MatchStrip.test.tsx` → PASS; full suite → PASS.

- [ ] **Step 4: Commit**
```bash
git add src/components/MatchStrip.tsx src/components/MatchStrip.test.tsx src/App.css
git commit -m "feat(detect): pending suggestions as hollow rings on the match strip"
```

---

### Task 7: Verification (main session; implementer runs steps 1–3 and reports)

- [ ] **Step 1: Gates** — `npm run test:run`, `npx tsc -b --noEmit`, `npm run build`, `npm run lint` (12 known problems, no new); check exit codes.
- [ ] **Step 2: Screenshots** on the dev server (port from the brief, never 5174) with a short generated test video
  (≤ 30 s, 720p, ffmpeg in the scratchpad, with a 1 kHz burst at 10 s then near-silence for 10 s so one suggestion appears):
  menu with "Find goals Beta"; progress; a suggestion card; the team step; the summary; strip rings — at 390×844, 844×390,
  834×1194, 1280×800, 1440×900, dark and light, touch emulation on phones/tablets. Look at every screenshot.
- [ ] **Step 3: Worker in the production build** — `npm run build && npx vite preview --port <brief port>`; run Find goals on the
  test video; confirm in DevTools that a worker script loads and no main-thread long task exceeds ~200 ms while listening.
- [ ] **Step 4 (main session): real footage parity** — for the six test matches, run Find goals in Chrome, use **Copy scores**,
  and compare the top-60 moments with `spikes/goal-detect/transfer/audio_rank_plus10.py` output: goals caught within ±10 s in a
  2× shortlist should match the spike within ±1 per match. Record timings (seconds per match) for 4K GoPro and 720p.
- [ ] **Step 5 (user): real devices** — laptop Chrome, iOS Safari and Android Chrome on one match each; report verified/unverified.
