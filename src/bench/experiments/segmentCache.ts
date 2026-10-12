// Experiment 2 (estimate): re-render a short highlights reel after changing one caption, reusing the encoded units that did not change.
// Bench-only prototype: units are stored in OPFS keyed by a hash of everything that goes into them. Not wired into the editor.
import { LogParser, encodeRecord, type LogRecord } from '../../render/packetLog'
import type { UnitCache, UnitDescriptor } from '../../render/experiments'
import { prepareSpec } from '../../graphics/prepare'
import type { GraphicsSpec } from '../../graphics/types'
import type { Cut } from '../../render/types'
import { highlightsExport, planOutput } from '../../utils/exportPlans'
import { CACHE_DIR, bitrateFor, excerptLen, excerptState, hash64, pair, run, verifyOutput, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

const UNIT_SEC = 10

async function cacheDir(): Promise<FileSystemDirectoryHandle> {
    return (await navigator.storage.getDirectory()).getDirectoryHandle(CACHE_DIR, { create: true })
}

/** A unit store in OPFS: `<key>.bin` (a packet log, timestamps relative to the unit) plus `<key>.json` (the graphics it applied). */
export function opfsUnitStore(): UnitCache & { hits: number; misses: number; stored: number; use: (k: UnitCache['keyOf']) => void; reset: () => void } {
    let current: UnitCache['keyOf'] = () => null
    const store = {
        hits: 0, misses: 0, stored: 0,
        use: (k: UnitCache['keyOf']) => { current = k },
        reset: () => { store.hits = 0; store.misses = 0; store.stored = 0 },
        keyOf: (u: UnitDescriptor) => current(u),
        async load(key: string) {
            try {
                const dir = await cacheDir()
                const file = await (await dir.getFileHandle(`${key}.bin`)).getFile()
                const applied = JSON.parse(await (await (await dir.getFileHandle(`${key}.json`)).getFile()).text()) as string[]
                store.hits++
                async function* records(): AsyncGenerator<LogRecord> {
                    const parser = new LogParser()
                    const STEP = 8 * 1024 * 1024
                    for (let o = 0; o < file.size; o += STEP) yield* parser.push(new Uint8Array(await file.slice(o, Math.min(file.size, o + STEP)).arrayBuffer()))
                }
                return { records: records(), applied }
            } catch {
                store.misses++
                return null
            }
        },
        async save(key: string, records: AsyncIterable<LogRecord>, applied: string[]) {
            const dir = await cacheDir()
            const w = await (await dir.getFileHandle(`${key}.bin`, { create: true })).createWritable()
            for await (const r of records) await w.write(encodeRecord(r))
            await w.close()
            const j = await (await dir.getFileHandle(`${key}.json`, { create: true })).createWritable()
            await j.write(JSON.stringify(applied))
            await j.close()
            store.stored++
        },
    }
    return store
}

/** Hash of every input of a unit: the footage, the cut, the output settings, the graphics drawn on it and the cut before it. */
function unitKeyOf(ctx: ExpCtx, cuts: Cut[], spec: GraphicsSpec | undefined, W: number, H: number, bitrate: number): UnitCache['keyOf'] {
    const src = { n: ctx.source.name, s: ctx.source.file.size, m: ctx.source.file.lastModified }
    return (u) => {
        const base = { v: 1, src, W, H, bitrate, theme: spec?.theme, kind: u.kind, frames: u.frames }
        if (u.kind === 'intro') return hash64(JSON.stringify({ ...base, card: spec?.intro }))
        if (u.kind === 'outro') return hash64(JSON.stringify({ ...base, card: spec?.outro }))
        const ci = u.cutIndex!
        // A replay carries the caption on from the clip before it, so overlays of the next cut that carry on are part of this unit's inputs too.
        const a = u.sourceStartSec ?? 0
        const b = u.sourceEndSec ?? Infinity
        const overlays = (spec?.overlays ?? []).filter((o) => o.cutIndex === ci && (o.kind !== 'caption' || (o.startSec < b + 1e-3 && o.startSec + o.durationSec > a - 1e-3)))
        return hash64(JSON.stringify({ ...base, cut: cuts[ci], prev: cuts[ci - 1] ?? null, first: u.firstFrame, overlays }))
    }
}

export async function segmentCacheRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; detail: Record<string, unknown> }> {
    const len = excerptLen(ctx)
    const quality = '1080p'
    const out = planOutput(quality)!
    const s1 = excerptState(ctx, len, { replays: true, goals: 2 })
    const plan1 = highlightsExport({ ...s1, graphics: { ...s1.graphics, cards: true } }, 'full', out)
    // Change ONE caption: the scorer of goal 2.
    const s2 = { ...s1, events: s1.events.map((e) => (e.id === 'g2' ? { ...e, scorer: 'D. Different' } : e)) }
    const plan2 = highlightsExport({ ...s2, graphics: { ...s2.graphics, cards: true } }, 'full', out)
    const g1 = await prepareSpec(plan1.spec)
    const g2 = await prepareSpec(plan2.spec)
    const W = 1920
    const H = Math.round((1920 * ctx.probe.height) / ctx.probe.width / 2) * 2
    const store = opfsUnitStore()
    const detail: Record<string, unknown> = { reelSeconds: plan1.seconds, cuts: plan1.cuts.length }
    const row = await pair('1080p highlights reel, one caption changed', ['full render', 'incremental'], async () => {
        // Full render, saving every unit (the cost of saving is included).
        store.reset()
        store.use(unitKeyOf(ctx, plan1.cuts, plan1.spec, W, H, bitrateFor(quality)))
        const r = await run(ctx, plan1.cuts, { quality, ...(g1 ? { graphics: g1 } : {}), extra: { experiments: { segmentSec: UNIT_SEC, unitCache: store } } })
        return { wallMs: r.wallMs, bytes: r.bytes, detail: { unitsStored: store.stored } }
    }, async () => {
        // Same store, the second plan's keys: units the change did not touch load from the first render.
        store.reset()
        store.use(unitKeyOf(ctx, plan2.cuts, plan2.spec, W, H, bitrateFor(quality)))
        const r = await run(ctx, plan2.cuts, { quality, ...(g2 ? { graphics: g2 } : {}), extra: { experiments: { segmentSec: UNIT_SEC, unitCache: store } } })
        const check = await verifyOutput(r.file, 'incremental.mp4', [])
        return { wallMs: r.wallMs, bytes: r.bytes, detail: { unitsReused: store.hits, unitsRendered: store.misses, outputCheck: check }, notes: check.ok ? [`${store.hits} units reused, ${store.misses} re-rendered`] : [`output check failed: ${check.problems.join('; ')}`] }
    }, { keepCacheAfterBaseline: true })
    return { rows: [row], notes: [`${UNIT_SEC} s units. The full-time card lists scorers, so changing the goal 2 scorer also redraws that card. An estimate: not in the editor.`], detail }
}
