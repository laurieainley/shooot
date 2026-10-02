# GoPro Direct Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load raw GoPro HEVC MP4s and LRV proxies directly, edit on either, and render a full-quality (stream-copied) or LRV preview highlight reel without the HandBrake step.

**Architecture:** Pure utils handle GoPro filename pairing (`gopro.ts`), accept rules (`fileAccept.ts`) and render planning (`renderPlan.ts`). Rendering goes through a single `renderReel()` interface in `src/render/`. A time-boxed spike decides whether the implementation is Mediabunny (packet-level remux streamed to OPFS, flat memory) or the existing ffmpeg.wasm pipeline made HEVC-aware. Spec: `docs/superpowers/specs/2026-10-03-gopro-direct-import-design.md`.

**Tech Stack:** React 19, TypeScript, Zustand 5, Vitest 4 (+ happy-dom for components), Mediabunny 1.61 (new), @ffmpeg/ffmpeg 0.12 (fallback only).

---

## Context for the implementer

- `MatchEvent.matchTimeSec` is the time **within the event's source file** (`sourceFileIndex`), not the global timeline. See `src/utils/highlights.ts`: segment `startTime < 0` means the padding window starts in the *previous* file.
- `mergeOverlappingGoalSegments()` (`src/utils/highlights.ts`) already merges overlapping windows. Reuse it; do not reimplement.
- `VideoSourceFile.file` is used for playback via `url` (`src/components/Player.tsx:158`). Files are not persisted (see `partialize` in `src/state.ts:216`).
- Current render code lives entirely in `src/components/RenderHighlights.tsx` and loads single-threaded ffmpeg core from unpkg (not `/public/ffmpeg/` as CLAUDE.md claims).
- Real test media on the author's Mac: `/Volumes/GoPro/DCIM/100GOPRO/GX010226.MP4` (11.9 GB HEVC 1080p29.97, 1.001 s GOP) and `GL010226.LRV` (H.264 768×432). Mounted only when the SD card is inserted.
- Tests: `npm run test:run`. Default env is `node`; component tests need `// @vitest-environment happy-dom` as the first line.
- Commit after every task. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/utils/gopro.ts` | create | Parse GoPro filenames; pair proxies with full files |
| `src/utils/fileAccept.ts` | create | Pure accept rule (extension or MIME) |
| `src/utils/renderPlan.ts` | create | `HighlightSegment[]` → `Cut[]` (cross-file split, clamping) |
| `src/utils/probe.ts` | modify | Use accept rule; codec detection + playability via Mediabunny |
| `src/utils/processFiles.ts` | modify | Probe, then pair; keep unplayable files with a `playbackIssue` |
| `src/types.ts` | modify | Extend `VideoSourceFile` |
| `src/render/types.ts` | create | `Cut`, `RenderSource`, `RenderProgress`, `RenderOptions`, `RenderFn` |
| `src/render/mediabunnyEngine.ts` | create (if spike passes) | Packet remux → OPFS |
| `src/render/ffmpegEngine.ts` | create (if spike fails) | HEVC-aware ffmpeg.wasm pipeline moved out of the component |
| `src/render/index.ts` | create | Re-exports the chosen engine as `renderReel` |
| `src/state.ts` | modify | `attachFullFiles(files: File[])` action |
| `src/components/RenderHighlights.tsx` | rewrite | Preview/full buttons, missing-files prompt, progress, download/share |
| `src/components/FilePills.tsx` | modify | `accept`, badges |
| `src/components/EmptyPlayer.tsx` | modify | Copy mentions LRV |
| `spikes/mediabunny.html`, `spikes/mediabunny.ts` | create | Throwaway spike (not built by Vite app) |

**Coordination with sub-project A (running in parallel):** A changes `FilePills.onPick` to *append* instead of replace and moves nothing in `RenderHighlights.tsx` (#18 was moved to B). Expect a trivial merge conflict in `FilePills.tsx`; keep both changes.

---

### Task 0: Worktree and dependency

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Create worktree**

```bash
cd /Users/foundersfactory/code/shot-stopper
git worktree add ../shot-stopper-b -b feat/gopro-import
cd ../shot-stopper-b
cp ../shot-stopper/localhost+2*.pem . 2>/dev/null || true
npm install
```

- [ ] **Step 2: Add Mediabunny**

```bash
npm install mediabunny@1.61.0
```

- [ ] **Step 3: Verify baseline**

Run: `npm run test:run`
Expected: `Tests  28 passed (28)`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add mediabunny

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Mediabunny spike (time-box: half a day) — DECISION GATE

**Files:**
- Create: `spikes/mediabunny.html`
- Create: `spikes/mediabunny.ts`

The spike page is served by the existing Vite dev server at `https://localhost:5174/spikes/mediabunny.html` (Vite serves any HTML under the root in dev). It is not part of the production build because `index.html` is the only build entry.

- [ ] **Step 1: Write the spike page**

`spikes/mediabunny.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>Mediabunny spike</title>
<body style="font: 14px system-ui; padding: 16px">
  <p>Pick a GoPro MP4 (or LRV). Renders 10 × 14 s cuts spaced 120 s apart.</p>
  <input id="file" type="file" />
  <button id="go">Render</button>
  <pre id="log"></pre>
  <video id="out" controls style="max-width: 100%"></video>
  <script type="module" src="./mediabunny.ts"></script>
</body>
```

`spikes/mediabunny.ts`:

```ts
import {
    ALL_FORMATS, BlobSource, EncodedAudioPacketSource, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, StreamTarget,
    type StreamTargetChunk,
} from 'mediabunny'

const log = (m: string): void => {
    document.getElementById('log')!.textContent += m + '\n'
    console.log(m)
}

async function run(file: File): Promise<void> {
    const t0 = performance.now()
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    const v = await input.getPrimaryVideoTrack()
    const a = await input.getPrimaryAudioTrack()
    if (!v || !a || !v.codec || !a.codec) throw new Error('missing track/codec')
    log(`video ${v.codec} ${await v.getCodecParameterString()} | audio ${a.codec}`)

    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle('spike.mp4', { create: true })
    const writable = await handle.createWritable()
    const sink = new WritableStream<StreamTargetChunk>({
        write: (c) => writable.write({ type: 'write', position: c.position, data: c.data }),
        close: () => writable.close(),
    })
    const output = new Output({ format: new Mp4OutputFormat(), target: new StreamTarget(sink, { chunked: true }) })
    const vOut = new EncodedVideoPacketSource(v.codec)
    const aOut = new EncodedAudioPacketSource(a.codec)
    output.addVideoTrack(vOut)
    output.addAudioTrack(aOut)
    await output.start()

    const vSink = new EncodedPacketSink(v)
    const aSink = new EncodedPacketSink(a)
    const vMeta = { decoderConfig: (await v.getDecoderConfig())! }
    const aMeta = { decoderConfig: (await a.getDecoderConfig())! }
    let cursor = 0
    let first = true
    for (let i = 0; i < 10; i++) {
        const start = 60 + i * 120
        const end = start + 14
        const k0 = await vSink.getKeyPacket(start)
        const kEnd = await vSink.getKeyPacket(end)
        if (!k0) break
        const kStop = kEnd ? await vSink.getNextKeyPacket(kEnd) : null
        const cutStart = k0.timestamp
        const cutEnd = kStop ? kStop.timestamp : end
        const offset = cursor - cutStart
        for await (const p of vSink.packets(k0, kStop ?? undefined)) {
            await vOut.add(p.clone({ timestamp: p.timestamp + offset }), first ? vMeta : undefined)
            first = false
        }
        const aStart = await aSink.getPacket(cutStart)
        let aFirst = cursor === 0
        if (aStart) {
            for await (const p of aSink.packets(aStart)) {
                if (p.timestamp >= cutEnd) break
                const ts = p.timestamp + offset
                if (ts < cursor) continue
                await aOut.add(p.clone({ timestamp: ts }), aFirst ? aMeta : undefined)
                aFirst = false
            }
        }
        cursor += cutEnd - cutStart
        log(`cut ${i + 1}: ${cutStart.toFixed(3)}–${cutEnd.toFixed(3)} (${(performance.now() - t0) / 1000 | 0}s)`)
    }
    await output.finalize()
    const out = await handle.getFile()
    log(`done: ${(out.size / 1e6).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
    ;(document.getElementById('out') as HTMLVideoElement).src = URL.createObjectURL(out)
}

document.getElementById('go')!.addEventListener('click', () => {
    const f = (document.getElementById('file') as HTMLInputElement).files?.[0]
    if (f) run(f).catch((e: unknown) => log(`ERROR: ${String(e)}`))
})
```

- [ ] **Step 2: Run on desktop with the full MP4**

Run `npm run dev`, open `https://localhost:5174/spikes/mediabunny.html` in Chrome, pick `/Volumes/GoPro/DCIM/100GOPRO/GX010226.MP4`, open DevTools → Performance monitor (JS heap) before clicking Render.

Record: total time, peak JS heap, any errors.

- [ ] **Step 3: Verify output is stream-copied**

Download the output via DevTools console:

```js
const f = await (await (await navigator.storage.getDirectory()).getFileHandle('spike.mp4')).getFile()
const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = 'spike.mp4'; a.click()
```

Then:

```bash
ffprobe -v error -show_entries stream=codec_name,codec_tag_string,bit_rate:format=duration -of compact ~/Downloads/spike.mp4
```

Expected: `codec_name=hevc|codec_tag_string=hvc1`, video bitrate ≈ 40 Mbps, duration ≈ 140–150 s.

- [ ] **Step 4: Check playback**

Open `~/Downloads/spike.mp4` in QuickTime and in Chrome. Scrub across each cut boundary (every ~14 s). Look for frozen frames, green/grey blocks, or audio drift.

- [ ] **Step 5: Android check (user-run)**

Ask the user to open the dev server from their phone (same network: `https://<mac-ip>:5174/spikes/mediabunny.html`, accept the cert warning), pick `GL010226.LRV` from the SD card, and report the log output and whether the result plays.

- [ ] **Step 6: Record the decision**

Append a `## Spike result` section to the spec with the measured numbers and PASS/FAIL against the five criteria:

1. Plays in Chrome + QuickTime, no boundary glitches / drift > ~1 frame
2. `hevc`/`hvc1`, bitrate ≈ source
3. Peak JS heap < ~500 MB
4. Total time < 60 s on the Mac from the SD card
5. LRV preview works on the user's Android phone

**PASS ⇒ do Task 7A, skip 7B. FAIL ⇒ do Task 7B, skip 7A.** If only criterion 5 fails, do 7A and keep phone rendering preview-only (note it in the spec).

- [ ] **Step 7: Commit**

```bash
git add spikes docs/superpowers/specs/2026-10-03-gopro-direct-import-design.md
git commit -m "spike: mediabunny stream-copy remux to OPFS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: GoPro filename parsing

**Files:**
- Create: `src/utils/gopro.ts`
- Test: `src/utils/gopro.test.ts`

GoPro names: `G` + `X` (HEVC) / `H` (H.264) / `L` (LRV proxy) + 2-digit chapter + 4-digit recording number + `.MP4`/`.LRV`. The pairing key is the 6 digits (chapter + number), so `GX020238.MP4` pairs with `GL020238.LRV`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseGoProName } from './gopro'

describe('parseGoProName', () => {
    it('should parse an HEVC full file', () => {
        expect(parseGoProName('GX010226.MP4')).toEqual({ key: '010226', chapter: 1, kind: 'full' })
    })

    it('should parse an H.264 full file', () => {
        expect(parseGoProName('GH030012.MP4')).toEqual({ key: '030012', chapter: 3, kind: 'full' })
    })

    it('should parse an LRV proxy', () => {
        expect(parseGoProName('GL010226.LRV')).toEqual({ key: '010226', chapter: 1, kind: 'proxy' })
    })

    it('should be case-insensitive', () => {
        expect(parseGoProName('gl020238.lrv')).toEqual({ key: '020238', chapter: 2, kind: 'proxy' })
    })

    it('should return null for non-GoPro names', () => {
        expect(parseGoProName('match.mp4')).toBeNull()
        expect(parseGoProName('GX010226.THM')).toBeNull()
        expect(parseGoProName('GL010226.MP4')).toBeNull()
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/gopro.test.ts`
Expected: FAIL — `Failed to resolve import "./gopro"`

- [ ] **Step 3: Implement**

```ts
export type GoProKind = 'full' | 'proxy'

export type GoProName = {
    key: string
    chapter: number
    kind: GoProKind
}

const GOPRO_NAME = /^G([XHL])(\d{2})(\d{4})\.(MP4|LRV)$/i

export function parseGoProName(name: string): GoProName | null {
    const m = GOPRO_NAME.exec(name)
    if (!m) return null
    const letter = m[1].toUpperCase()
    const ext = m[4].toUpperCase()
    const isProxy = letter === 'L' && ext === 'LRV'
    const isFull = letter !== 'L' && ext === 'MP4'
    if (!isProxy && !isFull) return null
    return { key: `${m[2]}${m[3]}`, chapter: Number(m[2]), kind: isProxy ? 'proxy' : 'full' }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/gopro.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/gopro.ts src/utils/gopro.test.ts
git commit -m "feat: parse GoPro file names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pair proxies with full files

**Files:**
- Modify: `src/utils/gopro.ts`
- Test: `src/utils/gopro.test.ts`

`pairFiles` is generic over the item type so it can pair both raw `File`s and probed entries. Output order: by GoPro key (recording, then chapter — which is chronological for GoPro), non-GoPro files after, in input order.

- [ ] **Step 1: Write the failing test** (append to `gopro.test.ts`)

```ts
import { pairFiles } from './gopro'

const n = (name: string) => ({ name })

describe('pairFiles', () => {
    it('should pair a proxy with its full file', () => {
        const r = pairFiles([n('GX010226.MP4'), n('GL010226.LRV')])
        expect(r).toEqual([{ key: '010226', proxy: n('GL010226.LRV'), full: n('GX010226.MP4') }])
    })

    it('should keep orphan proxies and orphan full files', () => {
        const r = pairFiles([n('GL010001.LRV'), n('GX010002.MP4')])
        expect(r).toEqual([
            { key: '010001', proxy: n('GL010001.LRV'), full: undefined },
            { key: '010002', proxy: undefined, full: n('GX010002.MP4') },
        ])
    })

    it('should order by recording number then chapter', () => {
        const r = pairFiles([n('GX020238.MP4'), n('GX010240.MP4'), n('GX010238.MP4')])
        expect(r.map((e) => e.key)).toEqual(['010238', '020238', '010240'])
    })

    it('should pass non-GoPro files through as full, after GoPro files, in input order', () => {
        const r = pairFiles([n('b.mp4'), n('GX010001.MP4'), n('a.mp4')])
        expect(r.map((e) => e.full?.name)).toEqual(['GX010001.MP4', 'b.mp4', 'a.mp4'])
        expect(r[1]).toEqual({ key: null, proxy: undefined, full: n('b.mp4') })
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/gopro.test.ts`
Expected: FAIL — `pairFiles is not a function` / import error

- [ ] **Step 3: Implement** (append to `gopro.ts`)

```ts
export type PairedEntry<T> = {
    key: string | null
    proxy?: T
    full?: T
}

export function pairFiles<T extends { name: string }>(items: T[]): PairedEntry<T>[] {
    const byKey = new Map<string, PairedEntry<T>>()
    const others: PairedEntry<T>[] = []
    for (const item of items) {
        const parsed = parseGoProName(item.name)
        if (!parsed) {
            others.push({ key: null, proxy: undefined, full: item })
            continue
        }
        const entry = byKey.get(parsed.key) ?? { key: parsed.key, proxy: undefined, full: undefined }
        entry[parsed.kind] = item
        byKey.set(parsed.key, entry)
    }
    // key = CCNNNN; sort by recording (NNNN) then chapter (CC)
    const sortKey = (k: string): string => `${k.slice(2)}${k.slice(0, 2)}`
    const gopro = [...byKey.values()].sort((a, b) => sortKey(a.key!).localeCompare(sortKey(b.key!)))
    return [...gopro, ...others]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/gopro.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/gopro.ts src/utils/gopro.test.ts
git commit -m "feat: pair GoPro LRV proxies with full MP4s

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Accept rule

**Files:**
- Create: `src/utils/fileAccept.ts`
- Test: `src/utils/fileAccept.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { isAcceptedVideo, FILE_INPUT_ACCEPT } from './fileAccept'

describe('isAcceptedVideo', () => {
    it('should accept by MIME type', () => {
        expect(isAcceptedVideo('clip', 'video/mp4')).toBe(true)
    })

    it('should accept .mp4 and .lrv by extension when MIME is empty (Android SD card)', () => {
        expect(isAcceptedVideo('GX010226.MP4', '')).toBe(true)
        expect(isAcceptedVideo('GL010226.LRV', '')).toBe(true)
        expect(isAcceptedVideo('x.mp4', 'application/octet-stream')).toBe(true)
    })

    it('should reject other files', () => {
        expect(isAcceptedVideo('GX010226.THM', '')).toBe(false)
        expect(isAcceptedVideo('notes.txt', 'text/plain')).toBe(false)
    })
})

describe('FILE_INPUT_ACCEPT', () => {
    it('should list extensions only (no MIME wildcards that trigger the Android Photo Picker)', () => {
        expect(FILE_INPUT_ACCEPT).toBe('.mp4,.MP4,.lrv,.LRV')
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/fileAccept.test.ts`
Expected: FAIL — import error

- [ ] **Step 3: Implement**

```ts
const VIDEO_EXT = /\.(mp4|lrv)$/i

// Extension-only on purpose: `video/*` makes recent Android Chrome open the
// Photo Picker, which hides USB storage (SD card readers).
export const FILE_INPUT_ACCEPT = '.mp4,.MP4,.lrv,.LRV'

export function isAcceptedVideo(name: string, mimeType: string): boolean {
    return mimeType.includes('mp4') || VIDEO_EXT.test(name)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/fileAccept.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/fileAccept.ts src/utils/fileAccept.test.ts
git commit -m "feat: accept MP4/LRV by extension for Android SD cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Render plan

**Files:**
- Create: `src/render/types.ts`
- Create: `src/utils/renderPlan.ts`
- Test: `src/utils/renderPlan.test.ts`

This extracts the cut arithmetic from `RenderHighlights.tsx:120-225`. A segment with `startTime < 0` and `sourceFileIndex > 0` becomes two cuts: the tail of the previous file and the head of the current one. Everything is clamped to `[0, durationSec]`.

- [ ] **Step 1: Create shared render types**

`src/render/types.ts`:

```ts
export type Cut = {
    sourceIndex: number
    startSec: number
    endSec: number
}

export type RenderSource = {
    name: string
    file: File
}

export type RenderProgress = {
    cutIndex: number   // 0-based index of the cut being processed
    cutCount: number
    fraction: number   // 0..1 overall
}

export type RenderOptions = {
    onProgress: (p: RenderProgress) => void
    signal?: AbortSignal
}

export type RenderFn = (cuts: Cut[], sources: RenderSource[], opts: RenderOptions) => Promise<File | Blob>
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildRenderPlan } from './renderPlan'
import type { HighlightSegment } from './highlights'

const seg = (sourceFileIndex: number, startTime: number, endTime: number): HighlightSegment => ({
    sourceFileIndex, startTime, endTime, duration: endTime - startTime, goals: [],
})

describe('buildRenderPlan', () => {
    it('should return no cuts for no segments', () => {
        expect(buildRenderPlan([], [100])).toEqual([])
    })

    it('should map a single-file segment to one cut', () => {
        expect(buildRenderPlan([seg(0, 50, 64)], [100])).toEqual([{ sourceIndex: 0, startSec: 50, endSec: 64 }])
    })

    it('should clamp to file bounds', () => {
        expect(buildRenderPlan([seg(0, -3, 11)], [100])).toEqual([{ sourceIndex: 0, startSec: 0, endSec: 11 }])
        expect(buildRenderPlan([seg(0, 95, 104)], [100])).toEqual([{ sourceIndex: 0, startSec: 95, endSec: 100 }])
    })

    it('should split a cross-file segment into previous-file tail and current-file head', () => {
        expect(buildRenderPlan([seg(1, -6, 8)], [100, 200])).toEqual([
            { sourceIndex: 0, startSec: 94, endSec: 100 },
            { sourceIndex: 1, startSec: 0, endSec: 8 },
        ])
    })

    it('should drop zero-length cuts', () => {
        expect(buildRenderPlan([seg(0, 100, 104)], [100])).toEqual([])
    })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/utils/renderPlan.test.ts`
Expected: FAIL — import error

- [ ] **Step 4: Implement**

```ts
import type { HighlightSegment } from './highlights'
import type { Cut } from '../render/types'

export function buildRenderPlan(segments: HighlightSegment[], durationsSec: number[]): Cut[] {
    const cuts: Cut[] = []
    const push = (sourceIndex: number, start: number, end: number): void => {
        const dur = durationsSec[sourceIndex] ?? Infinity
        const startSec = Math.max(0, Math.min(start, dur))
        const endSec = Math.max(0, Math.min(end, dur))
        if (endSec > startSec) cuts.push({ sourceIndex, startSec, endSec })
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
    }
    return cuts
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/utils/renderPlan.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/render/types.ts src/utils/renderPlan.ts src/utils/renderPlan.test.ts
git commit -m "feat: extract render cut planning into pure util

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Types, probe and processFiles

**Files:**
- Modify: `src/types.ts:1-9`
- Modify: `src/utils/probe.ts`
- Modify: `src/utils/processFiles.ts`
- Test: `src/utils/processFiles.test.ts`

- [ ] **Step 1: Extend `VideoSourceFile`** in `src/types.ts`

```ts
export type VideoSourceFile = {
    id: string
    file: File            // played in the editor (proxy if one is available and playable)
    url: string
    name: string
    durationSec?: number
    width?: number
    height?: number
    kind: 'full' | 'proxy'
    codec?: 'h264' | 'hevc'
    fullFile?: File       // full-quality file used for render when `file` is a proxy
    playbackIssue?: string // set when this browser cannot play `file`
}
```

Run: `npx tsc -b --noEmit 2>&1 | head -20` — fix any object literals that now need `kind` (expected: `src/utils/processFiles.ts` only, rewritten below).

- [ ] **Step 2: Replace `probe.ts`**

Codec detection uses Mediabunny (reads only the `moov` box). Playability is the browser's answer for that exact codec string, confirmed by loading metadata in a `<video>`.

```ts
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { isAcceptedVideo } from './fileAccept'

export type ProbedMetadata = {
    durationSec?: number
    width?: number
    height?: number
    codec?: 'h264' | 'hevc'
    accepted: boolean
    playable: boolean
    error?: string
}

async function readTrackInfo(file: File): Promise<Pick<ProbedMetadata, 'codec' | 'durationSec' | 'width' | 'height'> & { codecString?: string }> {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    try {
        const v = await input.getPrimaryVideoTrack()
        if (!v) return {}
        const codec = v.codec === 'hevc' ? 'hevc' : v.codec === 'avc' ? 'h264' : undefined
        return {
            codec,
            codecString: (await v.getCodecParameterString()) ?? undefined,
            durationSec: await input.computeDuration(),
            width: v.displayWidth,
            height: v.displayHeight,
        }
    } finally {
        input.dispose()
    }
}

function loadsInVideoElement(file: File): Promise<boolean> {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    return new Promise<boolean>((resolve) => {
        const done = (ok: boolean): void => {
            video.removeAttribute('src')
            URL.revokeObjectURL(url)
            resolve(ok)
        }
        video.addEventListener('loadedmetadata', () => done(video.videoWidth > 0), { once: true })
        video.addEventListener('error', () => done(false), { once: true })
        video.src = url
    })
}

export async function probeVideoFile(file: File): Promise<ProbedMetadata> {
    if (!isAcceptedVideo(file.name, file.type)) {
        return { accepted: false, playable: false, error: `${file.name}: not an MP4/LRV file` }
    }
    try {
        const info = await readTrackInfo(file)
        if (!info.codec) return { accepted: false, playable: false, error: `${file.name}: no H.264/HEVC video track` }
        const v = document.createElement('video')
        const canPlay = info.codecString ? v.canPlayType(`video/mp4; codecs="${info.codecString}"`) !== '' : true
        const playable = canPlay && (await loadsInVideoElement(file))
        return {
            ...info,
            accepted: true,
            playable,
            error: playable ? undefined : `Can't play ${info.codec.toUpperCase()} in this browser`,
        }
    } catch {
        return { accepted: false, playable: false, error: `${file.name}: could not read file` }
    }
}
```

Check the property names against the installed types before moving on:

Run: `grep -nE "displayWidth|displayHeight|dispose\(\)" node_modules/mediabunny/dist/mediabunny.d.ts | head`
Expected: matches for `displayWidth`, `displayHeight` on `InputVideoTrack` and `dispose()` on `Input`. If a name differs, use the installed one.

- [ ] **Step 3: Write the failing processFiles test**

`processVideoFiles` gains an injectable probe so it can be tested in `node`.

```ts
import { describe, it, expect, vi } from 'vitest'
import { processVideoFiles } from './processFiles'
import type { ProbedMetadata } from './probe'

vi.spyOn(URL, 'createObjectURL').mockImplementation((f) => `blob:${(f as File).name}`)

const file = (name: string): File => new File([''], name)
const ok = (codec: 'h264' | 'hevc', durationSec = 100): ProbedMetadata =>
    ({ accepted: true, playable: true, codec, durationSec, width: 1920, height: 1080 })

describe('processVideoFiles', () => {
    it('should use a playable proxy for playback and attach the full file', async () => {
        const probe = vi.fn(async (f: File) => (f.name.endsWith('LRV') ? ok('h264') : ok('hevc')))
        const r = await processVideoFiles([file('GX010226.MP4'), file('GL010226.LRV')], probe)
        expect(r.files).toHaveLength(1)
        expect(r.files[0]).toMatchObject({ name: 'GL010226.LRV', kind: 'proxy', codec: 'h264' })
        expect(r.files[0].fullFile?.name).toBe('GX010226.MP4')
    })

    it('should prefer the full file when only it is given', async () => {
        const r = await processVideoFiles([file('GX010226.MP4')], async () => ok('hevc'))
        expect(r.files[0]).toMatchObject({ name: 'GX010226.MP4', kind: 'full', codec: 'hevc' })
        expect(r.files[0].fullFile).toBeUndefined()
    })

    it('should keep an unplayable full file with a playbackIssue', async () => {
        const probe = async (): Promise<ProbedMetadata> =>
            ({ accepted: true, playable: false, codec: 'hevc', durationSec: 100, error: "Can't play HEVC in this browser" })
        const r = await processVideoFiles([file('GX010226.MP4')], probe)
        expect(r.files[0].playbackIssue).toBe("Can't play HEVC in this browser")
    })

    it('should drop unaccepted files and report the error', async () => {
        const probe = async (): Promise<ProbedMetadata> => ({ accepted: false, playable: false, error: 'x.THM: not an MP4/LRV file' })
        const r = await processVideoFiles([file('x.THM')], probe)
        expect(r.files).toEqual([])
        expect(r.error).toBe('x.THM: not an MP4/LRV file')
    })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/utils/processFiles.test.ts`
Expected: FAIL — results lack `kind` / pairing

- [ ] **Step 5: Rewrite `processFiles.ts`**

```ts
import type { VideoSourceFile } from '../types'
import { probeVideoFile, type ProbedMetadata } from './probe'
import { pairFiles } from './gopro'

export type ProcessResult = {
    files: VideoSourceFile[]
    error: string | null
}

type Probed = { name: string; file: File; meta: ProbedMetadata }

export async function processVideoFiles(
    fileList: FileList | File[],
    probe: (f: File) => Promise<ProbedMetadata> = probeVideoFile,
): Promise<ProcessResult> {
    const probed: Probed[] = []
    let error: string | null = null
    for (const f of Array.from(fileList)) {
        const meta = await probe(f)
        if (!meta.accepted) {
            error = meta.error ?? 'Unsupported file'
            continue
        }
        probed.push({ name: f.name, file: f, meta })
    }

    const files: VideoSourceFile[] = []
    for (const [idx, entry] of pairFiles(probed).entries()) {
        const useProxy = entry.proxy && (entry.proxy.meta.playable || !entry.full?.meta.playable)
        const play = (useProxy ? entry.proxy : entry.full)!
        files.push({
            id: `${Date.now()}-${idx}`,
            file: play.file,
            url: URL.createObjectURL(play.file),
            name: play.name,
            durationSec: play.meta.durationSec,
            width: play.meta.width,
            height: play.meta.height,
            kind: useProxy ? 'proxy' : 'full',
            codec: play.meta.codec,
            fullFile: useProxy ? entry.full?.file : undefined,
            playbackIssue: play.meta.playable ? undefined : play.meta.error,
        })
    }
    return { files, error }
}
```

- [ ] **Step 6: Run all tests**

Run: `npm run test:run`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/utils/probe.ts src/utils/processFiles.ts src/utils/processFiles.test.ts
git commit -m "feat: probe HEVC/H.264 via mediabunny and pair GoPro proxies on load

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7A: Mediabunny engine (only if spike PASSED)

**Files:**
- Create: `src/render/mediabunnyEngine.ts`
- Create: `src/render/index.ts`

Promotes the spike loop into a `RenderFn`. Cuts are snapped to keyframes: start at the key packet at/before `startSec`; end at the first key packet after the key packet at/before `endSec` (keeps whole GOPs so B-frames decode). Output goes to OPFS; falls back to an in-memory `BufferTarget` if OPFS writable streams are unavailable.

Not unit-tested (engine internals; per CLAUDE.md). Verified in Task 10.

- [ ] **Step 1: Implement `mediabunnyEngine.ts`**

```ts
import {
    ALL_FORMATS, BlobSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, StreamTarget,
    type InputAudioTrack, type InputVideoTrack, type StreamTargetChunk, type Target,
} from 'mediabunny'
import type { Cut, RenderFn, RenderSource } from './types'

const OUTPUT_NAME = 'highlights.mp4'

type OpenSource = { input: Input; video: InputVideoTrack; audio: InputAudioTrack | null }

async function openSource(src: RenderSource): Promise<OpenSource> {
    const input = new Input({ source: new BlobSource(src.file), formats: ALL_FORMATS })
    const video = await input.getPrimaryVideoTrack()
    if (!video?.codec) throw new Error(`${src.name}: no readable video track`)
    return { input, video, audio: await input.getPrimaryAudioTrack() }
}

async function makeTarget(): Promise<{ target: Target; result: () => Promise<File | Blob> }> {
    try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(OUTPUT_NAME).catch(() => undefined)
        const handle = await root.getFileHandle(OUTPUT_NAME, { create: true })
        const writable = await handle.createWritable()
        const sink = new WritableStream<StreamTargetChunk>({
            write: (c) => writable.write({ type: 'write', position: c.position, data: c.data }),
            close: () => writable.close(),
            abort: () => writable.abort(),
        })
        return { target: new StreamTarget(sink, { chunked: true }), result: () => handle.getFile() }
    } catch {
        const target = new BufferTarget()
        return { target, result: async () => new Blob([target.buffer!], { type: 'video/mp4' }) }
    }
}

function assertCompatible(sources: OpenSource[], used: Set<number>): void {
    const vc = new Set([...used].map((i) => sources[i].video.codec))
    const ac = new Set([...used].map((i) => sources[i].audio?.codec ?? 'none'))
    if (vc.size > 1) throw new Error('Clips use different video codecs (e.g. HEVC and H.264) and cannot be joined without re-encoding')
    if (ac.size > 1) throw new Error('Clips use different audio formats and cannot be joined without re-encoding')
}

export const renderReel: RenderFn = async (cuts: Cut[], sources: RenderSource[], { onProgress, signal }) => {
    const used = new Set(cuts.map((c) => c.sourceIndex))
    const opened: OpenSource[] = []
    for (const [i, s] of sources.entries()) {
        if (used.has(i)) opened[i] = await openSource(s)
    }
    assertCompatible(opened, used)

    const first = opened[cuts[0].sourceIndex]
    const { target, result } = await makeTarget()
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
    const vOut = new EncodedVideoPacketSource(first.video.codec!)
    output.addVideoTrack(vOut)
    const aOut = first.audio?.codec ? new EncodedAudioPacketSource(first.audio.codec) : null
    if (aOut) output.addAudioTrack(aOut)
    await output.start()

    const vMeta = { decoderConfig: (await first.video.getDecoderConfig())! }
    const aMeta = first.audio ? { decoderConfig: (await first.audio.getDecoderConfig())! } : undefined
    const total = cuts.reduce((acc, c) => acc + (c.endSec - c.startSec), 0)
    let cursor = 0
    let done = 0
    let vFirst = true
    let aFirst = true

    try {
        for (const [ci, cut] of cuts.entries()) {
            if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
            const src = opened[cut.sourceIndex]
            const vSink = new EncodedPacketSink(src.video)
            const k0 = await vSink.getKeyPacket(cut.startSec) ?? await vSink.getFirstKeyPacket()
            if (!k0) continue
            const kEnd = await vSink.getKeyPacket(cut.endSec)
            const kStop = kEnd && kEnd.timestamp > k0.timestamp ? await vSink.getNextKeyPacket(kEnd) : await vSink.getNextKeyPacket(k0)
            const cutStart = k0.timestamp
            const cutEnd = kStop ? kStop.timestamp : cut.endSec
            const offset = cursor - cutStart

            for await (const p of vSink.packets(k0, kStop ?? undefined)) {
                await vOut.add(p.clone({ timestamp: p.timestamp + offset }), vFirst ? vMeta : undefined)
                vFirst = false
                onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, (done + (p.timestamp - cutStart)) / total) })
            }

            if (aOut && src.audio) {
                const aSink = new EncodedPacketSink(src.audio)
                const a0 = await aSink.getPacket(cutStart)
                if (a0) {
                    for await (const p of aSink.packets(a0)) {
                        if (p.timestamp >= cutEnd) break
                        const ts = p.timestamp + offset
                        if (ts < cursor) continue
                        await aOut.add(p.clone({ timestamp: ts }), aFirst ? aMeta : undefined)
                        aFirst = false
                    }
                }
            }
            cursor += cutEnd - cutStart
            done += cut.endSec - cut.startSec
            onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, done / total) })
        }
        await output.finalize()
        return await result()
    } catch (e) {
        await output.cancel().catch(() => undefined)
        throw e
    } finally {
        for (const s of opened) s?.input.dispose()
    }
}
```

- [ ] **Step 2: Create `src/render/index.ts`**

```ts
export { renderReel } from './mediabunnyEngine'
export type { Cut, RenderSource, RenderProgress, RenderOptions, RenderFn } from './types'
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `src/render/`. If a Mediabunny type name differs from the installed `.d.ts`, use the installed one (`grep -n "<name>" node_modules/mediabunny/dist/mediabunny.d.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/render
git commit -m "feat: mediabunny stream-copy render engine writing to OPFS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7B: FFmpeg engine (only if spike FAILED)

**Files:**
- Create: `src/render/ffmpegEngine.ts`
- Create: `src/render/index.ts`

Moves the pipeline out of the component and fixes: per-codec bitstream filter, stream mapping (drops `tmcd`/`gpmd`), `hvc1` tag, and memory (segments leave MEMFS as soon as written; final concat reads them via WORKERFS). Progress is computed per cut, not from ffmpeg's `progress` event. Input codec comes from the probe (passed on `RenderSource`).

- [ ] **Step 1: Extend `RenderSource`** in `src/render/types.ts`

```ts
export type RenderSource = {
    name: string
    file: File
    codec?: 'h264' | 'hevc'
}
```

- [ ] **Step 2: Implement `ffmpegEngine.ts`**

```ts
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import type { RenderFn } from './types'

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

export const renderReel: RenderFn = async (cuts, sources, { onProgress, signal }) => {
    const codecs = new Set(cuts.map((c) => sources[c.sourceIndex].codec ?? 'h264'))
    if (codecs.size > 1) throw new Error('Clips use different video codecs and cannot be joined without re-encoding')
    const codec = [...codecs][0]
    const bsf = codec === 'hevc' ? 'hevc_mp4toannexb' : 'h264_mp4toannexb'

    const ffmpeg = new FFmpeg()
    await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    const used = [...new Set(cuts.map((c) => c.sourceIndex))]
    for (const i of used) {
        await ffmpeg.createDir(`/in_${i}`)
        await ffmpeg.mount(FFFSType.WORKERFS, { files: [sources[i].file] }, `/in_${i}`)
    }

    const segBlobs: Blob[] = []
    try {
        for (const [ci, cut] of cuts.entries()) {
            if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
            onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: ci / (cuts.length + 1) })
            const name = `seg_${ci}.ts`
            await ffmpeg.exec([
                '-ss', String(cut.startSec),
                '-i', `/in_${cut.sourceIndex}/${sources[cut.sourceIndex].file.name}`,
                '-t', String(cut.endSec - cut.startSec),
                '-map', '0:v:0', '-map', '0:a:0?',
                '-c:v', 'copy', '-c:a', 'copy',
                '-avoid_negative_ts', 'make_zero',
                '-bsf:v', bsf,
                '-f', 'mpegts', name,
            ])
            const data = await ffmpeg.readFile(name)
            segBlobs.push(new Blob([data as BlobPart]))
            await ffmpeg.deleteFile(name)
        }

        onProgress({ cutIndex: cuts.length - 1, cutCount: cuts.length, fraction: cuts.length / (cuts.length + 1) })
        await ffmpeg.createDir('/segs')
        await ffmpeg.mount(FFFSType.WORKERFS, {
            blobs: segBlobs.map((data, i) => ({ name: `seg_${i}.ts`, data })),
        }, '/segs')
        const list = segBlobs.map((_, i) => `file '/segs/seg_${i}.ts'`).join('\n') + '\n'
        await ffmpeg.writeFile('list.txt', new TextEncoder().encode(list))
        await ffmpeg.exec([
            '-f', 'concat', '-safe', '0', '-i', 'list.txt',
            '-c:v', 'copy',
            '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '160k',
            ...(codec === 'hevc' ? ['-tag:v', 'hvc1'] : []),
            '-movflags', '+faststart',
            'highlights.mp4',
        ])
        const out = await ffmpeg.readFile('highlights.mp4')
        onProgress({ cutIndex: cuts.length - 1, cutCount: cuts.length, fraction: 1 })
        return new Blob([out as BlobPart], { type: 'video/mp4' })
    } finally {
        ffmpeg.terminate()
    }
}
```

- [ ] **Step 3: Create `src/render/index.ts`**

```ts
export { renderReel } from './ffmpegEngine'
export type { Cut, RenderSource, RenderProgress, RenderOptions, RenderFn } from './types'
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `src/render/`.

- [ ] **Step 5: Commit**

```bash
git add src/render
git commit -m "feat: HEVC-aware ffmpeg render engine with bounded memory

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Store action to attach full files later

**Files:**
- Modify: `src/state.ts`
- Test: `src/state.test.ts`

When the user edited with LRVs only and presses Full render, they pick the MP4s; this action attaches each to the timeline entry with the same GoPro key and returns names it could not match.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppState } from './state'
import type { VideoSourceFile } from './types'

const proxy = (name: string): VideoSourceFile =>
    ({ id: name, file: new File([''], name), url: '', name, kind: 'proxy', durationSec: 100 })

describe('attachFullFiles', () => {
    beforeEach(() => useAppState.setState({ files: [proxy('GL010226.LRV'), proxy('GL010227.LRV')] }))

    it('should attach matching full files and report unmatched names', () => {
        const unmatched = useAppState.getState().attachFullFiles([new File([''], 'GX010226.MP4'), new File([''], 'GX019999.MP4')])
        const files = useAppState.getState().files
        expect(files[0].fullFile?.name).toBe('GX010226.MP4')
        expect(files[1].fullFile).toBeUndefined()
        expect(unmatched).toEqual(['GX019999.MP4'])
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/state.test.ts`
Expected: FAIL — `attachFullFiles is not a function`

- [ ] **Step 3: Implement**

In `src/state.ts` add the import and type member:

```ts
import { parseGoProName } from './utils/gopro'
// in type AppState:
    attachFullFiles: (files: File[]) => string[]
```

Add the action next to `removeFile`:

```ts
            attachFullFiles: (picked) => {
                const unmatched: string[] = []
                const files = get().files.slice()
                for (const f of picked) {
                    const key = parseGoProName(f.name)?.key
                    const idx = key ? files.findIndex((e) => e.kind === 'proxy' && parseGoProName(e.name)?.key === key) : -1
                    if (idx === -1) unmatched.push(f.name)
                    else files[idx] = { ...files[idx], fullFile: f }
                }
                set({ files })
                return unmatched
            },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/state.test.ts
git commit -m "feat: attach full-quality MP4s to proxy timeline entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: RenderHighlights rewrite

**Files:**
- Rewrite: `src/components/RenderHighlights.tsx`
- Create: `src/utils/renderSources.ts`
- Test: `src/utils/renderSources.test.ts`
- Test: `src/components/RenderHighlights.test.tsx`

- [ ] **Step 1: Write the failing util test** (`src/utils/renderSources.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { resolveRenderSources, formatRenderProgress } from './renderSources'
import type { VideoSourceFile } from '../types'

const vf = (name: string, kind: 'full' | 'proxy', fullName?: string): VideoSourceFile => ({
    id: name, name, kind, url: '', file: new File([''], name),
    fullFile: fullName ? new File([''], fullName) : undefined,
})

describe('resolveRenderSources', () => {
    it('should use proxies as-is for preview', () => {
        const r = resolveRenderSources([vf('GL010226.LRV', 'proxy')], 'preview')
        expect(r).toEqual({ sources: [{ name: 'GL010226.LRV', file: expect.any(File) }], missing: [] })
    })

    it('should use attached full files for full render', () => {
        const r = resolveRenderSources([vf('GL010226.LRV', 'proxy', 'GX010226.MP4')], 'full')
        expect(r.sources[0].name).toBe('GX010226.MP4')
        expect(r.missing).toEqual([])
    })

    it('should list proxies without a full file as missing for full render', () => {
        const r = resolveRenderSources([vf('GL010226.LRV', 'proxy'), vf('a.mp4', 'full')], 'full')
        expect(r.missing).toEqual(['GL010226.LRV'])
    })
})

describe('formatRenderProgress', () => {
    it('should format clip count and percent', () => {
        expect(formatRenderProgress({ cutIndex: 2, cutCount: 12, fraction: 0.414 })).toBe('Clip 3 of 12 · 41%')
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/renderSources.test.ts`
Expected: FAIL — import error

- [ ] **Step 3: Implement `src/utils/renderSources.ts`**

```ts
import type { VideoSourceFile } from '../types'
import type { RenderProgress, RenderSource } from '../render/types'

export type RenderQuality = 'full' | 'preview'

export function resolveRenderSources(
    files: VideoSourceFile[],
    quality: RenderQuality,
): { sources: RenderSource[]; missing: string[] } {
    const missing: string[] = []
    const sources = files.map((f): RenderSource => {
        if (quality === 'preview' || f.kind === 'full') return { name: f.name, file: f.file }
        if (f.fullFile) return { name: f.fullFile.name, file: f.fullFile }
        missing.push(f.name)
        return { name: f.name, file: f.file }
    })
    return { sources, missing }
}

export function formatRenderProgress(p: RenderProgress): string {
    return `Clip ${p.cutIndex + 1} of ${p.cutCount} · ${Math.round(p.fraction * 100)}%`
}
```

**Only if Task 7B was used** (the ffmpeg engine needs the codec of the file it actually reads): the attached full file was never probed, so derive its codec from the GoPro letter (`GX` = HEVC, `GH` = H.264). Replace the `sources` mapping body with:

```ts
        if (quality === 'preview' || f.kind === 'full') return { name: f.name, file: f.file, codec: f.codec }
        if (f.fullFile) {
            const codec = /^GX/i.test(f.fullFile.name) ? 'hevc' : /^GH/i.test(f.fullFile.name) ? 'h264' : f.codec
            return { name: f.fullFile.name, file: f.fullFile, codec }
        }
        missing.push(f.name)
        return { name: f.name, file: f.file, codec: f.codec }
```

and add this test to `describe('resolveRenderSources')`:

```ts
    it('should derive the codec of an attached GoPro full file from its name', () => {
        const r = resolveRenderSources([{ ...vf('GL010226.LRV', 'proxy', 'GX010226.MP4'), codec: 'h264' }], 'full')
        expect(r.sources[0].codec).toBe('hevc')
    })
```

The first test's `toEqual` then needs `codec: undefined` added to the expected source.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/renderSources.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing component test** (`src/components/RenderHighlights.test.tsx`)

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))

import { RenderHighlights } from './RenderHighlights'

const proxy: VideoSourceFile = { id: 'p', name: 'GL010226.LRV', kind: 'proxy', url: '', file: new File([''], 'GL010226.LRV'), durationSec: 600 }

describe('RenderHighlights', () => {
    beforeEach(() => {
        renderReel.mockReset()
        useAppState.setState({
            files: [proxy],
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }],
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
        })
    })

    it('should show both render buttons when the timeline has proxies', () => {
        render(<RenderHighlights />)
        expect(screen.getByRole('button', { name: /preview reel/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /full quality/i })).toBeInTheDocument()
    })

    it('should list missing full files instead of rendering', async () => {
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /full quality/i }))
        expect(screen.getByText(/GL010226\.LRV/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /pick full files/i })).toBeInTheDocument()
        expect(renderReel).not.toHaveBeenCalled()
    })

    it('should render a preview from proxies and show progress then a download link', async () => {
        renderReel.mockImplementation(async (_c, _s, { onProgress }) => {
            onProgress({ cutIndex: 0, cutCount: 1, fraction: 0.5 })
            return new Blob(['x'], { type: 'video/mp4' })
        })
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        expect(renderReel).toHaveBeenCalledWith(
            [{ sourceIndex: 0, startSec: 90, endSec: 104 }],
            [{ name: 'GL010226.LRV', file: proxy.file }],
            expect.objectContaining({ onProgress: expect.any(Function) }),
        )
        expect(await screen.findByRole('link', { name: /download/i })).toBeInTheDocument()
    })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/components/RenderHighlights.test.tsx`
Expected: FAIL — no "Preview reel" button

- [ ] **Step 7: Rewrite `RenderHighlights.tsx`**

```tsx
import { useRef, useState } from 'react'
import { useAppState } from '../state'
import { renderReel } from '../render'
import { mergeOverlappingGoalSegments } from '../utils/highlights'
import { buildRenderPlan } from '../utils/renderPlan'
import { resolveRenderSources, formatRenderProgress, type RenderQuality } from '../utils/renderSources'
import { FILE_INPUT_ACCEPT } from '../utils/fileAccept'

type Result = { url: string; file: File }

export function RenderHighlights() {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const attachFullFiles = useAppState((s) => s.attachFullFiles)
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)
    const [missing, setMissing] = useState<string[]>([])
    const [result, setResult] = useState<Result | null>(null)
    const pickRef = useRef<HTMLInputElement | null>(null)

    const hasProxies = files.some((f) => f.kind === 'proxy')
    const disabled = busy || files.length === 0 || events.length === 0

    const run = async (quality: RenderQuality): Promise<void> => {
        const { sources, missing: miss } = resolveRenderSources(files, quality)
        if (miss.length > 0) {
            setMissing(miss)
            return
        }
        setMissing([])
        if (result) URL.revokeObjectURL(result.url)
        setResult(null)
        setBusy(true)
        setStatus('Preparing…')
        try {
            const segments = mergeOverlappingGoalSegments(events, cumulativeOffsets, matchStartTimeSec, adjustTimestampsByOffset, before, after)
            const cuts = buildRenderPlan(segments, files.map((f) => f.durationSec ?? Infinity))
            const out = await renderReel(cuts, sources, { onProgress: (p) => setStatus(formatRenderProgress(p)) })
            const name = quality === 'preview' ? 'highlights-preview.mp4' : 'highlights.mp4'
            const file = out instanceof File ? out : new File([out], name, { type: 'video/mp4' })
            setResult({ url: URL.createObjectURL(file), file })
            setStatus('Done')
        } catch (e) {
            setStatus(`Render failed: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setBusy(false)
        }
    }

    const onPickFull = (evt: React.ChangeEvent<HTMLInputElement>): void => {
        const picked = Array.from(evt.target.files ?? [])
        evt.target.value = ''
        const unmatched = attachFullFiles(picked)
        const stillMissing = resolveRenderSources(useAppState.getState().files, 'full').missing
        setMissing(stillMissing)
        if (unmatched.length > 0) setStatus(`No match for: ${unmatched.join(', ')}`)
    }

    const canShare = result != null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [result.file] })

    return (
        <div className="flex flex-col gap-2">
            {hasProxies && (
                <button
                    onClick={() => run('preview')}
                    disabled={disabled}
                    className="w-full rounded-md border border-yellow/50 bg-transparent px-3 py-2 text-sm font-bold text-yellow cursor-pointer hover:bg-yellow/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Preview reel (LRV)
                </button>
            )}
            <button
                onClick={() => run('full')}
                disabled={disabled}
                className="w-full rounded-md bg-yellow px-3 py-2.5 text-sm font-bold text-deep border-none cursor-pointer hover:bg-yellow/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                {hasProxies ? 'Full quality render' : 'Render MP4'}
            </button>

            {missing.length > 0 && (
                <div className="rounded border border-pink/40 p-2 text-xs text-muted">
                    <p className="mb-1">Full-quality files needed for:</p>
                    <ul className="mb-2 list-disc pl-4">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                    <div className="flex gap-2">
                        <button onClick={() => pickRef.current?.click()} className="rounded bg-yellow px-2 py-1 font-bold text-deep border-none cursor-pointer">
                            Pick full files
                        </button>
                        <button onClick={() => run('preview')} className="rounded border border-border bg-transparent px-2 py-1 text-light cursor-pointer">
                            Render preview instead
                        </button>
                    </div>
                    <input ref={pickRef} type="file" multiple accept={FILE_INPUT_ACCEPT} onChange={onPickFull} className="hidden" />
                </div>
            )}

            {status && <div className="text-xs text-muted">{status}</div>}
            {result && (
                <div className="flex gap-3">
                    <a href={result.url} download={result.file.name} className="text-sm font-semibold text-yellow hover:text-yellow/80">
                        Download {result.file.name}
                    </a>
                    {canShare && (
                        <button
                            onClick={() => navigator.share({ files: [result.file] }).catch(() => undefined)}
                            className="bg-transparent border-none p-0 text-sm font-semibold text-yellow cursor-pointer"
                        >
                            Share
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 8: Run all tests**

Run: `npm run test:run`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/RenderHighlights.tsx src/components/RenderHighlights.test.tsx src/utils/renderSources.ts src/utils/renderSources.test.ts
git commit -m "feat: preview/full render with missing-file prompt, progress and share

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: File pickers and badges

**Files:**
- Modify: `src/components/FilePills.tsx:47-53,80-86`
- Modify: `src/components/EmptyPlayer.tsx:41-46`
- Create: `src/utils/fileBadges.ts`
- Test: `src/utils/fileBadges.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { fileBadges } from './fileBadges'
import type { VideoSourceFile } from '../types'

const base: VideoSourceFile = { id: 'x', name: 'x', url: '', file: new File([''], 'x'), kind: 'full' }

describe('fileBadges', () => {
    it('should show HEVC for HEVC full files', () => {
        expect(fileBadges({ ...base, codec: 'hevc' })).toEqual(['HEVC'])
    })
    it('should mark proxies with and without a full file', () => {
        expect(fileBadges({ ...base, kind: 'proxy', fullFile: new File([''], 'GX.MP4') })).toEqual(['proxy', 'full attached'])
        expect(fileBadges({ ...base, kind: 'proxy' })).toEqual(['proxy', 'preview only'])
    })
    it('should surface a playback issue', () => {
        expect(fileBadges({ ...base, playbackIssue: "Can't play HEVC" })).toEqual(["can't play here"])
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/fileBadges.test.ts`
Expected: FAIL — import error

- [ ] **Step 3: Implement**

```ts
import type { VideoSourceFile } from '../types'

export function fileBadges(f: VideoSourceFile): string[] {
    const badges: string[] = []
    if (f.playbackIssue) badges.push("can't play here")
    if (f.kind === 'proxy') badges.push('proxy', f.fullFile ? 'full attached' : 'preview only')
    else if (f.codec === 'hevc') badges.push('HEVC')
    return badges
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/fileBadges.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire into `FilePills.tsx`**

Add imports:

```tsx
import { FILE_INPUT_ACCEPT } from '../utils/fileAccept'
import { fileBadges } from '../utils/fileBadges'
```

After the duration `<span>` (line ~53) add:

```tsx
                    {fileBadges(f).map((b) => (
                        <span key={b} title={b === "can't play here" ? `${f.playbackIssue} — add the matching GL….LRV` : undefined}
                            className={`rounded px-1 text-[10px] uppercase tracking-wide ${b === "can't play here" ? 'bg-pink/20 text-pink' : 'bg-yellow/10 text-yellow/70'}`}>
                            {b}
                        </span>
                    ))}
```

On the `<input type="file">` (line ~80) add `accept={FILE_INPUT_ACCEPT}`.

- [ ] **Step 6: Update `EmptyPlayer.tsx` copy** (lines 42-45)

```tsx
                {dragging
                    ? 'Drop MP4 / LRV files to load them'
                    : <>Drop GoPro MP4s (or their .LRV previews) here, or click <strong className="text-light">+ Add file</strong></>
                }
```

- [ ] **Step 7: Run all tests and lint**

Run: `npm run test:run && npm run lint`
Expected: all PASS, no new lint errors

- [ ] **Step 8: Commit**

```bash
git add src/components/FilePills.tsx src/components/EmptyPlayer.tsx src/utils/fileBadges.ts src/utils/fileBadges.test.ts
git commit -m "feat: Android-friendly file accept and proxy/HEVC badges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end verification on real media

- [ ] **Step 1: Desktop full render**

`npm run dev`, open `https://localhost:5174`, load `GX010226.MP4` from the SD card, mark 5 events spread across the file, click **Render MP4**. Expected: progress `Clip n of 5 · x%`, finishes < 60 s, download plays in QuickTime; `ffprobe` shows `hevc`/`hvc1`.

- [ ] **Step 2: Desktop proxy flow**

Reload, load only `GL010226.LRV`. Mark 3 events. **Preview reel** → small H.264 file plays. **Full quality render** → missing prompt lists `GL010226.LRV` → **Pick full files** → choose `GX010226.MP4` → pill shows `full attached` → render → HEVC output; event moments match the preview.

- [ ] **Step 3: Android (user-run)**

User opens the dev server on their phone with the SD card attached via USB, taps **+ Add file**. Record: does the picker show the USB storage? Are `.LRV`/`.MP4` selectable? If USB storage is hidden, change `FILE_INPUT_ACCEPT` to `''` (no accept attribute), update the `fileAccept` test, and retest. Then preview reel → **Share** to WhatsApp.

- [ ] **Step 4: Record results** in the spec under `## Verification`, commit.

---

### Task 12: Cleanup (only if Task 7A was used)

**Files:**
- Modify: `package.json` (remove `@ffmpeg/*`)
- Delete: `public/ffmpeg/`
- Modify: `vite.config.ts` (remove COOP/COEP headers, ffmpeg `optimizeDeps`, `manualChunks.ffmpeg`, `external`)
- Modify: `vercel.json` (remove COOP/COEP header block)
- Modify: `CLAUDE.md` (FFmpeg sections → Mediabunny; tech stack; constraints)

- [ ] **Step 1: Remove dependencies and assets**

```bash
npm uninstall @ffmpeg/core @ffmpeg/core-mt @ffmpeg/ffmpeg @ffmpeg/util
git rm -r public/ffmpeg
```

- [ ] **Step 2: Edit `vite.config.ts`** — delete the `headers` block under `server`, the whole `optimizeDeps` block, `ffmpeg: [...]` from `manualChunks`, and `external: [...]` from `rollupOptions`.

- [ ] **Step 3: Edit `vercel.json`** — delete the `headers` array entry for COOP/COEP (keep `rewrites`).

- [ ] **Step 4: Update `CLAUDE.md`** — replace the "FFmpeg WASM" coding-practices section with:

```markdown
### Rendering (Mediabunny)
- Rendering lives behind `renderReel()` in `src/render/`. It remuxes encoded packets (no decode, no re-encode) from each cut into one MP4, streamed to OPFS so memory stays flat.
- Cuts snap to keyframes (GoPro: 1.001 s GOP). Audio is copied, so all clips in one render must share codec and audio parameters; mixed inputs are rejected with a message.
- GoPro `.LRV` proxies are paired with `GX`/`GH` MP4s by `src/utils/gopro.ts`; edit on proxies, render from `fullFile`.
- Do not unit-test engine internals; mock `../render` at the boundary.
```

and update the Tech Stack bullet, the "Large files" and "COOP/COEP" gotchas accordingly.

- [ ] **Step 5: Verify**

Run: `npm run build && npm run test:run && npm run lint`
Expected: build succeeds; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove ffmpeg.wasm and COOP/COEP now that mediabunny renders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
