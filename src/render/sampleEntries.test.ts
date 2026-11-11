import { describe, expect, it } from 'vitest'
import { splitSampleEntries, type ByteSource } from './sampleEntries'

const cat = (...p: Uint8Array[]): Uint8Array => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }
const box = (type: string, ...p: Uint8Array[]): Uint8Array => { const b = cat(...p); const o = new Uint8Array(8 + b.length); new DataView(o.buffer).setUint32(0, o.length); for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i); o.set(b, 8); return o }
const be = (...v: number[]): Uint8Array => { const o = new Uint8Array(v.length * 4); const d = new DataView(o.buffer); v.forEach((x, i) => d.setUint32(i * 4, x)); return o }

class W { bits: number[] = []; u(n: number, v: number): this { for (let i = n - 1; i >= 0; i--) this.bits.push((v >> i) & 1); return this } ue(v: number): this { const x = v + 1; const l = Math.floor(Math.log2(x)); return this.u(l, 0).u(l + 1, x) } bytes(): Uint8Array { const o = new Uint8Array(Math.ceil(this.bits.length / 8)); this.bits.forEach((b, i) => { o[i >> 3] |= b << (7 - (i & 7)) }); return o } }

/** An HEVC SPS NAL with the given level (and coded height, to tell several apart). */
const sps = (level: number, height = 1088): Uint8Array => cat(new Uint8Array([0x42, 1]), new W().u(4, 0).u(3, 0).u(1, 1).u(2, 0).u(1, 0).u(5, 1).u(32, 0x60000000).u(16, 0x9000).u(16, 0).u(16, 0).u(8, level).ue(0).ue(1).ue(1920).ue(height).u(1, 0).ue(0).ue(0).u(8, 0x80).bytes())
const vps = (n: number): Uint8Array => new Uint8Array([0x40, 1, n])
const pps = (n: number): Uint8Array => new Uint8Array([0x44, 1, n])
const hvcC = (sets: Uint8Array[][]): Uint8Array => {
    const head = new Uint8Array(23); head[0] = 1; head[1] = 1; head[12] = 120; head[21] = 3; head[22] = sets.length
    const arrays = sets.map((list) => cat(new Uint8Array([0x80 | ((list[0][0] >> 1) & 63), 0, list.length]), ...list.map((n) => cat(new Uint8Array([n.length >> 8, n.length & 255]), n))))
    return cat(head, ...arrays)
}
const withLen = (n: Uint8Array): Uint8Array => cat(be(n.length), n)

type Sample = { key: boolean; sets?: Uint8Array[]; size: number }
/** MP4 with one hvc1 entry (the `own` sets), chunks of `perChunk` samples, moov last. */
function mp4(own: Uint8Array[][], samples: Sample[], perChunk: number): { file: Uint8Array; src: ByteSource } {
    const data = samples.map((s) => cat(...(s.sets ?? []).map(withLen), withLen(new Uint8Array([s.key ? 38 : 2, 1, ...new Array(s.size).fill(7)]))))
    const ftyp = box('ftyp', new Uint8Array([105, 115, 111, 109, 0, 0, 0, 0]))
    const mdatStart = ftyp.length + 8
    const chunkOffsets: number[] = []
    let pos = mdatStart
    data.forEach((d, i) => { if (i % perChunk === 0) chunkOffsets.push(pos); pos += d.length })
    const entry = box('hvc1', new Uint8Array(78), box('hvcC', hvcC(own)), box('colr', new Uint8Array([1, 2, 3])))
    const stbl = box('stbl', box('stsd', be(0, 1), entry), box('stsc', ...(data.length % perChunk ? [be(0, 2, 1, perChunk, 1, chunkOffsets.length, data.length % perChunk, 1)] : [be(0, 1, 1, perChunk, 1)])), box('stsz', be(0, 0, data.length, ...data.map((d) => d.length))), box('stco', be(0, chunkOffsets.length, ...chunkOffsets)), box('stss', be(0, samples.filter((s) => s.key).length, ...samples.flatMap((s, i) => (s.key ? [i + 1] : [])))))
    const hdlr = box('hdlr', be(0, 0), new Uint8Array([118, 105, 100, 101]), new Uint8Array(13))
    const moov = box('moov', box('trak', box('mdia', hdlr, box('minf', stbl))))
    const file = cat(ftyp, box('mdat', ...data), moov)
    return { file, src: { size: file.length, read: async (s, e) => file.slice(s, e) } }
}

const kids = (b: Uint8Array, s: number, e: number): { type: string; s: number; e: number }[] => { const o = []; for (let p = s; p < e;) { const n = new DataView(b.buffer, b.byteOffset).getUint32(p); o.push({ type: String.fromCharCode(...b.subarray(p + 4, p + 8)), s: p, e: p + n }); p += n } return o }
function stbl(file: Uint8Array) {
    const top = kids(file, 0, file.length)
    const moov = top.find((b) => b.type === 'moov')!
    let cur = moov
    for (const n of ['trak', 'mdia', 'minf', 'stbl']) cur = kids(file, cur.s + 8, cur.e).find((b) => b.type === n)!
    const t = Object.fromEntries(kids(file, cur.s + 8, cur.e).map((b) => [b.type, b]))
    const dv = new DataView(file.buffer, file.byteOffset)
    const entries = dv.getUint32(t.stsd.s + 12)
    const types = kids(file, t.stsd.s + 16, t.stsd.e)
    const stsc = Array.from({ length: dv.getUint32(t.stsc.s + 12) }, (_, i) => [0, 1, 2].map((k) => dv.getUint32(t.stsc.s + 16 + i * 12 + k * 4)))
    const stco = Array.from({ length: dv.getUint32(t.stco.s + 12) }, (_, i) => dv.getUint32(t.stco.s + 16 + i * 4))
    return { moov, entries, types, stsc, stco, bytes: file }
}
const apply = (file: Uint8Array, r: { moovStart: number; moov: Uint8Array }): Uint8Array => cat(file.slice(0, r.moovStart), r.moov)

describe('splitSampleEntries', () => {
    const own = [[vps(1)], [sps(120)], [pps(1)]]
    const key = (level: number, n = 1): Sample => ({ key: true, sets: [vps(n), sps(level), pps(n)], size: 30 })
    const delta: Sample = { key: false, size: 10 }

    it('leaves a file with one set of parameter sets alone', async () => {
        const { src } = mp4(own, [key(120), delta, delta, key(120), delta, delta], 3)
        // in-band sets differ from the entry only if they are not the entry's own: here the same sets -> nothing to do
        const same = mp4(own, [{ key: true, sets: [vps(1), sps(120), pps(1)], size: 5 }, delta, { key: true, sets: [vps(1), sps(120), pps(1)], size: 5 }, delta], 2)
        expect(await splitSampleEntries(same.src)).toBeNull()
        expect(await splitSampleEntries(src)).toBeNull()
    })

    it('leaves a file without in-band sets alone', async () => {
        const { src } = mp4(own, [{ key: true, size: 5 }, delta, { key: true, size: 5 }, delta], 2)
        expect(await splitSampleEntries(src)).toBeNull()
    })

    it('writes one entry per distinct set and points each chunk at its own, cutting a chunk where an entry starts', async () => {
        // Entry set A (level 120) for samples 0-2, B (level 150) 3-5, A again 6-8; chunks of 4 samples, so the switch at 3 and 6 cuts chunks.
        const a = key(120)
        const bKey = key(150, 2)
        const samples = [a, delta, delta, bKey, delta, delta, a, delta, delta]
        const { file, src } = mp4(own, samples, 4)
        const r = (await splitSampleEntries(src))!
        expect(r.entries).toBe(2) // the original entry equals A, so it is reused
        const out = apply(file, r)
        const t = stbl(out)
        expect(t.entries).toBe(2)
        expect(t.types.map((b) => b.type)).toEqual(['hvc1', 'hvc1'])
        // chunks: [0-2] A, [3] B (cut from chunk 0-3), [4-5] B, [6] ... see below
        const sizes = samples.map((s) => s.size)
        expect(sizes.length).toBe(9)
        // every sample's offset is unchanged
        const expectedOffsets: number[] = []
        // walk the chunk table the file now holds
        const dv = new DataView(out.buffer, out.byteOffset)
        const sz = kids(out, t.moov.s + 8, t.moov.e)
        expect(sz.length).toBeGreaterThan(0)
        // chunk -> entry: rebuild by expanding stsc
        const perChunk: { count: number; entry: number }[] = []
        for (let i = 0; i < t.stsc.length; i++) {
            const next = i + 1 < t.stsc.length ? t.stsc[i + 1][0] : t.stco.length + 1
            for (let c = t.stsc[i][0]; c < next; c++) perChunk.push({ count: t.stsc[i][1], entry: t.stsc[i][2] })
        }
        expect(perChunk.reduce((a2, c) => a2 + c.count, 0)).toBe(9)
        // sample 3 (B key) is the first of a chunk whose entry differs from the previous one; sample 6 the same going back
        let s = 0
        const starts: number[] = []
        const entryOfSample: number[] = []
        perChunk.forEach((c, i) => { starts.push(s); for (let k = 0; k < c.count; k++) entryOfSample.push(c.entry); s += c.count; expectedOffsets.push(t.stco[i]) })
        expect(starts).toContain(3)
        expect(starts).toContain(6)
        expect(entryOfSample).toEqual([1, 1, 1, 2, 2, 2, 1, 1, 1])
        // chunk offsets match the samples' real positions
        const mdatStart = 24
        const pos: number[] = []
        let p = mdatStart
        const lens = samples.map((x) => (x.sets ?? []).reduce((q, n) => q + 4 + n.length, 0) + 4 + 2 + x.size)
        lens.forEach((l) => { pos.push(p); p += l })
        starts.forEach((st, i) => expect(t.stco[i]).toBe(pos[st]))
        void dv
    })

    it('the new entry carries exactly the in-band sets of its samples', async () => {
        const { file, src } = mp4(own, [key(120), delta, key(150, 2), delta], 2)
        const out = apply(file, (await splitSampleEntries(src))!)
        const t = stbl(out)
        const second = t.types[1]
        const hv = kids(out, second.s + 8 + 78, second.e).find((b) => b.type === 'hvcC')!
        const rec = out.subarray(hv.s + 8, hv.e)
        expect(rec[0]).toBe(1)
        expect(rec[12]).toBe(150) // level from its SPS
        expect(rec[22]).toBe(3)
        const has = (n: Uint8Array): boolean => rec.toString().includes(Array.from(n).toString()) || Array.from(rec).join(',').includes(Array.from(n).join(','))
        expect(has(sps(150))).toBe(true)
        expect(has(vps(2))).toBe(true)
        expect(has(pps(2))).toBe(true)
        expect(has(sps(120))).toBe(false)
        // the colour box of the original entry is kept
        expect(kids(out, second.s + 8 + 78, second.e).map((b) => b.type)).toEqual(['hvcC', 'colr'])
    })

    it('drops the original entry when every key frame carries sets of its own', async () => {
        const { file, src } = mp4(own, [key(130, 3), delta, key(150, 2), delta], 2)
        const r = (await splitSampleEntries(src))!
        expect(r.entries).toBe(2)
        expect(stbl(apply(file, r)).entries).toBe(2)
    })

    it('copes with many switches', async () => {
        const samples: Sample[] = []
        for (let i = 0; i < 600; i++) samples.push(i % 2 ? key(150, 2) : key(130, 3), delta, delta)
        const { file, src } = mp4(own, samples, 7)
        const r = (await splitSampleEntries(src))!
        expect(r.entries).toBe(2)
        const t = stbl(apply(file, r))
        expect(t.stco.length).toBeGreaterThan(600)
    })
})
