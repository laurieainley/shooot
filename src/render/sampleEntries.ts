// Apple players (QuickTime, Quick Look, Safari, iOS Photos) decode every sample with the parameter sets of the sample
// entry it points to and ignore other in-band sets, while Chrome follows the in-band ones. A spliced reel (footage GOPs
// plus encoder-made graphics GOPs, or footage of several files) carries several VPS/SPS/PPS under one hvc1/avc1 entry,
// so Apple fails on every GOP whose sets differ from that entry. The standard fix is one sample entry per distinct set
// of parameter sets, with `stsc` pointing each chunk to its entry (a new entry always starts a new chunk, and entries
// only change at sync samples). This rewrites the `moov` of a finished MP4 (written with the moov last, as Shooot does)
// without touching `mdat`: only the key frames' first bytes are read.
import { nalType } from './nal'

export type ByteSource = { size: number; read: (start: number, end: number) => Promise<Uint8Array> }
export type SplitResult = { moovStart: number; moov: Uint8Array; entries: number }

type Box = { type: string; start: number; end: number; header: number }

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const u64 = (b: Uint8Array, o: number): number => u32(b, o) * 2 ** 32 + u32(b, o + 4)
const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1]
const fourcc = (b: Uint8Array, o: number): string => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])

function boxes(b: Uint8Array, start: number, end: number): Box[] {
    const out: Box[] = []
    for (let o = start; o + 8 <= end;) {
        let size = u32(b, o)
        let header = 8
        if (size === 1) { size = u64(b, o + 8); header = 16 } else if (size === 0) size = end - o
        if (size < header || o + size > end) break
        out.push({ type: fourcc(b, o + 4), start: o, end: o + size, header })
        o += size
    }
    return out
}

const concat = (parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
    let o = 0
    for (const p of parts) { out.set(p, o); o += p.length }
    return out
}

function makeBox(type: string, ...payload: Uint8Array[]): Uint8Array {
    const body = concat(payload)
    const out = new Uint8Array(8 + body.length)
    new DataView(out.buffer).setUint32(0, out.length)
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
    out.set(body, 8)
    return out
}

const be32 = (...v: number[]): Uint8Array => { const o = new Uint8Array(v.length * 4); const d = new DataView(o.buffer); v.forEach((x, i) => d.setUint32(i * 4, x)); return o }

class Bits {
    private bit = 0
    private readonly b: Uint8Array
    constructor(b: Uint8Array) { this.b = b }
    u(n: number): number { let v = 0; for (let i = 0; i < n; i++, this.bit++) v = v * 2 + ((this.b[this.bit >> 3] >> (7 - (this.bit & 7))) & 1); return v }
    ue(): number { let z = 0; while (this.u(1) === 0 && z < 32) z++; return 2 ** z - 1 + this.u(z) }
}

const hex = (n: Uint8Array): string => Array.from(n, (x) => x.toString(16).padStart(2, '0')).join('')

/** hvcC fields an SPS decides. */
function hevcFields(sps: Uint8Array) {
    const r = new Bits(sps.length ? unescapeRbsp(sps) : sps)
    r.u(16); r.u(4)
    const maxSub = r.u(3)
    const nested = r.u(1)
    const profileSpace = r.u(2), tier = r.u(1), profile = r.u(5)
    const compat = r.u(32)
    const constraint = [r.u(16), r.u(16), r.u(16)]
    const level = r.u(8)
    const prof: boolean[] = [], lvl: boolean[] = []
    for (let i = 0; i < maxSub; i++) { prof.push(!!r.u(1)); lvl.push(!!r.u(1)) }
    if (maxSub > 0) for (let i = maxSub; i < 8; i++) r.u(2)
    for (let i = 0; i < maxSub; i++) { if (prof[i]) r.u(88); if (lvl[i]) r.u(8) }
    r.ue()
    const chroma = r.ue()
    if (chroma === 3) r.u(1)
    r.ue(); r.ue()
    if (r.u(1)) { r.ue(); r.ue(); r.ue(); r.ue() }
    const bdLuma = r.ue(), bdChroma = r.ue()
    return { maxSub, nested, profileSpace, tier, profile, compat, constraint, level, chroma, bdLuma, bdChroma }
}

function unescapeRbsp(nal: Uint8Array): Uint8Array {
    const out: number[] = []
    for (let i = 0; i < nal.length; i++) { if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue; out.push(nal[i]) }
    return new Uint8Array(out)
}

const HEVC_TYPES = [32, 33, 34]
const AVC_TYPES = [7, 8]

/** VPS/SPS/PPS (or SPS/PPS) of an hvcC / avcC record, by NAL type. */
function recordSets(rec: Uint8Array, hevc: boolean): Map<number, Uint8Array[]> {
    const out = new Map<number, Uint8Array[]>()
    const add = (n: Uint8Array): void => { const t = nalType(n, hevc); out.set(t, [...(out.get(t) ?? []), n]) }
    if (hevc) {
        let o = 23
        for (let a = 0, na = rec[22]; a < na; a++) {
            const n = u16(rec, o + 1); o += 3
            for (let k = 0; k < n; k++) { const len = u16(rec, o); add(rec.subarray(o + 2, o + 2 + len)); o += 2 + len }
        }
    } else {
        let o = 6
        for (let k = 0, n = rec[5] & 31; k < n; k++) { const len = u16(rec, o); add(rec.subarray(o + 2, o + 2 + len)); o += 2 + len }
        for (let k = 0, n = rec[o++]; k < n; k++) { const len = u16(rec, o); add(rec.subarray(o + 2, o + 2 + len)); o += 2 + len }
    }
    return out
}

/** The VPS/SPS/PPS NAL units at the start of a sample (length-prefixed), by type. */
function inbandSets(data: Uint8Array, hevc: boolean, ls: number): Map<number, Uint8Array[]> {
    const types = hevc ? HEVC_TYPES : AVC_TYPES
    const out = new Map<number, Uint8Array[]>()
    for (let o = 0; o + ls < data.length;) {
        let len = 0
        for (let i = 0; i < ls; i++) len = len * 256 + data[o + i]
        if (o + ls + len > data.length) break
        const nal = data.subarray(o + ls, o + ls + len)
        const t = nalType(nal, hevc)
        if (types.includes(t)) { const cur = out.get(t) ?? []; if (!cur.some((x) => hex(x) === hex(nal))) out.set(t, [...cur, nal]) }
        else if (hevc ? t < 32 : t >= 1 && t <= 5) break
        o += ls + len
    }
    return out
}

const signature = (sets: Map<number, Uint8Array[]>, types: number[]): string => types.map((t) => (sets.get(t) ?? []).map(hex).join(',')).join('|')

function buildHvcC(sets: Map<number, Uint8Array[]>, lengthMinus1: number): Uint8Array {
    const f = hevcFields(sets.get(33)![0])
    const arrays: Uint8Array[] = []
    for (const t of HEVC_TYPES) {
        const list = sets.get(t) ?? []
        if (!list.length) continue
        const parts: Uint8Array[] = [new Uint8Array([0x80 | t, 0, list.length])]
        for (const n of list) parts.push(new Uint8Array([n.length >> 8, n.length & 255]), n)
        arrays.push(concat(parts))
    }
    const head = new Uint8Array(23)
    head[0] = 1
    head[1] = (f.profileSpace << 6) | (f.tier << 5) | f.profile
    new DataView(head.buffer).setUint32(2, f.compat)
    for (let i = 0; i < 3; i++) { head[6 + i * 2] = f.constraint[i] >> 8; head[7 + i * 2] = f.constraint[i] & 255 }
    head[12] = f.level
    head[13] = 0xf0; head[14] = 0
    head[15] = 0xfc
    head[16] = 0xfc | f.chroma
    head[17] = 0xf8 | f.bdLuma
    head[18] = 0xf8 | f.bdChroma
    head[19] = 0; head[20] = 0
    head[21] = (Math.min(f.maxSub + 1, 7) << 3) | (f.nested << 2) | lengthMinus1
    head[22] = arrays.length
    return concat([head, ...arrays])
}

function buildAvcC(sets: Map<number, Uint8Array[]>, lengthMinus1: number, template: Uint8Array): Uint8Array {
    const sps = sets.get(7)!, pps = sets.get(8) ?? []
    const out: number[] = [1, sps[0][1], sps[0][2], sps[0][3], 0xfc | lengthMinus1, 0xe0 | sps.length]
    const push = (n: Uint8Array): void => { out.push(n.length >> 8, n.length & 255, ...n) }
    sps.forEach(push)
    out.push(pps.length)
    pps.forEach(push)
    if ([100, 110, 122, 144].includes(sps[0][1])) {
        // chroma / bit depth extension: the original record's when it has one, else 4:2:0 8-bit.
        let o = 6
        for (let k = 0, n = template[5] & 31; k < n; k++) o += 2 + u16(template, o)
        for (let k = 0, n = template[o++]; k < n; k++) o += 2 + u16(template, o)
        out.push(...(template.length >= o + 4 ? template.subarray(o, o + 4) : [0xfc | 1, 0xf8, 0xf8, 0]))
    }
    return new Uint8Array(out)
}

type Table = { first: number[]; count: number[]; offset: number[] }

/**
 * The finished MP4's `moov` with one sample entry per distinct set of parameter sets among the video key frames, or null
 * when nothing has to change (one set, no in-band sets, no video, fragmented, or the moov is not the last box).
 */
export async function splitSampleEntries(src: ByteSource): Promise<SplitResult | null> {
    // Top-level boxes: ftyp, mdat, moov last.
    let moov: Box | null = null
    for (let o = 0; o + 8 <= src.size;) {
        const head = await src.read(o, Math.min(o + 16, src.size))
        let size = u32(head, 0)
        if (size === 1) size = u64(head, 8); else if (size === 0) size = src.size - o
        const type = fourcc(head, 4)
        if (size < 8) return null
        if (type === 'moof') return null
        if (type === 'moov') moov = { type, start: o, end: o + size, header: u32(head, 0) === 1 ? 16 : 8 }
        o += size
    }
    if (!moov || moov.end !== src.size) return null
    const buf = await src.read(moov.start, moov.end)
    const trak = boxes(buf, moov.header, buf.length).filter((b) => b.type === 'trak').find((t) => {
        const path = (b: Box, ...names: string[]): Box | undefined => names.reduce<Box | undefined>((cur, n) => cur && boxes(buf, cur.start + cur.header, cur.end).find((c) => c.type === n), b)
        const hdlr = path(t, 'mdia', 'hdlr')
        return !!hdlr && fourcc(buf, hdlr.start + hdlr.header + 8) === 'vide'
    })
    if (!trak) return null
    const kids = (b: Box): Box[] => boxes(buf, b.start + b.header, b.end)
    const mdia = kids(trak).find((b) => b.type === 'mdia')!
    const minf = kids(mdia).find((b) => b.type === 'minf')!
    const stbl = kids(minf).find((b) => b.type === 'stbl')!
    const t = new Map(kids(stbl).map((b) => [b.type, b] as const))
    const stsd = t.get('stsd'), stsc = t.get('stsc'), stsz = t.get('stsz'), stss = t.get('stss')
    const stco = t.get('stco') ?? t.get('co64')
    if (!stsd || !stsc || !stsz || !stss || !stco) return null
    const body = (b: Box): number => b.start + b.header
    if (u32(buf, body(stsd) + 4) !== 1) return null // already several entries
    const entry = boxes(buf, body(stsd) + 8, stsd.end)[0]
    const hevc = entry.type === 'hvc1' || entry.type === 'hev1'
    if (!hevc && entry.type !== 'avc1' && entry.type !== 'avc3') return null
    const entryKids = boxes(buf, entry.start + entry.header + 78, entry.end)
    const cfg = entryKids.find((b) => b.type === (hevc ? 'hvcC' : 'avcC'))
    if (!cfg) return null
    const record = buf.subarray(body(cfg), cfg.end)
    const lengthMinus1 = record[hevc ? 21 : 4] & 3
    const ls = lengthMinus1 + 1
    const types = hevc ? HEVC_TYPES : AVC_TYPES
    const own = recordSets(record, hevc)
    const ownSig = signature(own, types)

    // Sample and chunk tables.
    const nSamples = u32(buf, body(stsz) + 8)
    const fixed = u32(buf, body(stsz) + 4)
    const sizeOf = (i: number): number => (fixed ? fixed : u32(buf, body(stsz) + 12 + i * 4))
    const nSync = u32(buf, body(stss) + 4)
    const sync = Array.from({ length: nSync }, (_, i) => u32(buf, body(stss) + 8 + i * 4) - 1)
    const co64 = stco.type === 'co64'
    const nChunks = u32(buf, body(stco) + 4)
    const chunkOffset = (i: number): number => (co64 ? u64(buf, body(stco) + 8 + i * 8) : u32(buf, body(stco) + 8 + i * 4))
    const nRuns = u32(buf, body(stsc) + 4)
    const table: Table = { first: [], count: [], offset: [] }
    {
        let sample = 0
        for (let r = 0; r < nRuns; r++) {
            const firstChunk = u32(buf, body(stsc) + 8 + r * 12) - 1
            const spc = u32(buf, body(stsc) + 12 + r * 12)
            const lastChunk = r + 1 < nRuns ? u32(buf, body(stsc) + 8 + (r + 1) * 12) - 1 : nChunks
            for (let c = firstChunk; c < lastChunk; c++) { table.first.push(sample); table.count.push(spc); table.offset.push(chunkOffset(c)); sample += spc }
        }
        if (sample !== nSamples) return null
    }

    // Key frames: the parameter sets each one carries (the first bytes hold them).
    const sigs: (string | null)[] = []
    const merged = new Map<string, Map<number, Uint8Array[]>>()
    const READ = 8192
    for (let i = 0; i < sync.length; i += 64) {
        const slice = sync.slice(i, i + 64)
        const reads = await Promise.all(slice.map((s) => {
            let lo = 0, hi = table.first.length - 1
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (table.first[mid] <= s) lo = mid; else hi = mid - 1 }
            const c = lo
            return src.read(table.offset[c] + sumSizes(sizeOf, table.first[c], s), Math.min(src.size, table.offset[c] + sumSizes(sizeOf, table.first[c], s) + READ))
        }))
        for (const data of reads) {
            const sets = inbandSets(data, hevc, ls)
            if (sets.size === 0) { sigs.push(null); continue }
            const all = new Map<number, Uint8Array[]>()
            for (const ty of types) all.set(ty, sets.get(ty) ?? own.get(ty) ?? [])
            const sig = signature(all, types)
            merged.set(sig, all)
            sigs.push(sig)
        }
    }
    // Entries in order of first use; the original entry is 0 and takes every sample without sets of its own.
    const order: string[] = [ownSig]
    const runs: { start: number; entry: number }[] = []
    let current = 0
    sync.forEach((s, k) => {
        const sig = sigs[k] ?? ownSig
        let idx = order.indexOf(sig)
        if (idx < 0) { order.push(sig); idx = order.length - 1 }
        if (idx !== current) { runs.push({ start: s, entry: idx }); current = idx }
    })
    if (order.length === 1) return null

    // New chunk table: a chunk is cut where an entry starts.
    const starts = new Map(runs.map((r) => [r.start, r.entry] as const))
    const cuts = [...starts.keys()].sort((a, b) => a - b)
    const entryAt = (sample: number): number => {
        let lo = 0, hi = runs.length - 1, ans = 0
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (runs[mid].start <= sample) { ans = runs[mid].entry; lo = mid + 1 } else hi = mid - 1 }
        return runs.length && runs[0].start <= sample ? ans : 0
    }
    const pieces: { count: number; offset: number; entry: number }[] = []
    let cutAt = 0
    for (let c = 0; c < table.first.length; c++) {
        const first = table.first[c], end = first + table.count[c]
        while (cutAt < cuts.length && cuts[cutAt] <= first) cutAt++
        let from = first
        let offset = table.offset[c]
        while (cutAt < cuts.length && cuts[cutAt] < end) {
            const cut = cuts[cutAt++]
            pieces.push({ count: cut - from, offset, entry: entryAt(from) })
            offset += sumSizes(sizeOf, from, cut)
            from = cut
        }
        pieces.push({ count: end - from, offset, entry: entryAt(from) })
    }
    // Entries that no chunk uses (the original one, when every key frame brings its own sets) are dropped.
    const used = [...new Set(pieces.map((p) => p.entry))].sort((a, b) => a - b)
    const renumber = new Map(used.map((e, i) => [e, i] as const))
    const newStsc: number[] = []
    let prev = ''
    pieces.forEach((p, i) => { const e = renumber.get(p.entry)!; const key = `${p.count}/${e}`; if (key !== prev) { newStsc.push(i + 1, p.count, e + 1); prev = key } })
    const big = pieces.some((p) => p.offset >= 2 ** 32)
    const newChunkOffsets = big
        ? makeBox('co64', be32(0, pieces.length), ...pieces.map((p) => be32(Math.floor(p.offset / 2 ** 32), p.offset >>> 0)))
        : makeBox('stco', be32(0, pieces.length), be32(...pieces.map((p) => p.offset)))
    const stscBox = makeBox('stsc', be32(0, newStsc.length / 3, ...newStsc))

    // One sample entry per distinct set: the original's boxes (colour, bitrate, ...) around its own hvcC / avcC.
    const entryBytes = (sig: string, i: number): Uint8Array => {
        if (i === 0) return buf.subarray(entry.start, entry.end)
        const sets = merged.get(sig)!
        const rec = hevc ? buildHvcC(sets, lengthMinus1) : buildAvcC(sets, lengthMinus1, record)
        const parts: Uint8Array[] = [buf.subarray(entry.start + 8, entry.start + 8 + 78)]
        for (const k of entryKids) parts.push(k.start === cfg.start ? makeBox(cfg.type, rec) : buf.subarray(k.start, k.end))
        return makeBox(entry.type, ...parts)
    }
    const newStsd = makeBox('stsd', be32(0, used.length), ...used.map((i) => entryBytes(order[i], i)))

    // Rebuild moov → trak → mdia → minf → stbl with the three tables replaced.
    const swap = (b: Box, f: (c: Box) => Uint8Array | null): Uint8Array =>
        makeBox(b.type, ...kids(b).map((c) => f(c) ?? buf.subarray(c.start, c.end)))
    const newStbl = swap(stbl, (c) => (c.start === stsd.start ? newStsd : c.start === stsc.start ? stscBox : c.start === stco.start ? newChunkOffsets : null))
    const newMinf = swap(minf, (c) => (c.start === stbl.start ? newStbl : null))
    const newMdia = swap(mdia, (c) => (c.start === minf.start ? newMinf : null))
    const newTrak = swap(trak, (c) => (c.start === mdia.start ? newMdia : null))
    const newMoov = swap({ type: 'moov', start: 0, end: buf.length, header: moov.header }, (c) => (c.start === trak.start ? newTrak : null))
    return { moovStart: moov.start, moov: newMoov, entries: used.length }
}

function sumSizes(sizeOf: (i: number) => number, from: number, to: number): number {
    let s = 0
    for (let i = from; i < to; i++) s += sizeOf(i)
    return s
}
