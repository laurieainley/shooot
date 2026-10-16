import { describe, expect, it } from 'vitest'
import { ALL_FORMATS, BufferSource, BufferTarget, EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink, EncodedVideoPacketSource, Input, Mp4OutputFormat, Output } from 'mediabunny'
import { buildSegment, openMseSource, splitInit } from './mseSegment'

const START = 10 // the fixture starts at 10 s so a rebased timestamp would show

/** A small MP4 of fake VP9 frames (1 s GOPs, 10 fps) and fake Opus packets, starting at START. */
async function fixture(): Promise<File> {
    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat(), target })
    const v = new EncodedVideoPacketSource('vp9')
    const a = new EncodedAudioPacketSource('opus')
    output.addVideoTrack(v)
    output.addAudioTrack(a)
    await output.start()
    const vMeta = { decoderConfig: { codec: 'vp09.00.10.08', codedWidth: 64, codedHeight: 64 } }
    for (let i = 0; i < 100; i++) {
        await v.add(new EncodedPacket(new Uint8Array(20).fill(i), i % 10 === 0 ? 'key' : 'delta', START + i / 10, 0.1), i === 0 ? vMeta : undefined)
    }
    const aMeta = { decoderConfig: { codec: 'opus', numberOfChannels: 2, sampleRate: 48000, description: new Uint8Array([79, 112, 117, 115, 72, 101, 97, 100, 1, 2, 56, 1, 128, 187, 0, 0, 0, 0, 0]) } }
    for (let i = 0; i < 500; i++) {
        await a.add(new EncodedPacket(new Uint8Array(10).fill(1), 'key', START + i * 0.02, 0.02), i === 0 ? aMeta : undefined)
    }
    v.close(); a.close()
    await output.finalize()
    return new File([target.buffer!], 'fixture.mp4', { type: 'video/mp4' })
}

async function packetsOf(bytes: Uint8Array, kind: 'video' | 'audio'): Promise<EncodedPacket[]> {
    const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })
    const track = kind === 'video' ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack()
    const out: EncodedPacket[] = []
    for await (const p of new EncodedPacketSink(track!).packets()) out.push(p)
    return out
}

describe('mse segments', () => {
    it('opens the primary tracks and reports mime strings', async () => {
        const r = await openMseSource(await fixture())
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.source.videoMime).toMatch(/^video\/mp4; codecs="vp09/)
        expect(r.source.audioMime).toMatch(/^audio\/mp4; codecs="opus"/)
        expect(r.source.base).toBeCloseTo(START, 3)
        expect(r.source.endSec).toBeCloseTo(START + 10, 2)
        r.source.dispose()
    })

    it('cuts at keyframes and keeps the source timestamps', async () => {
        const r = await openMseSource(await fixture())
        if (!r.ok) throw new Error(r.reason)
        const seg = await buildSegment(r.source, START + 3.4, 2, new AbortController().signal)
        expect(seg.start).toBeCloseTo(START + 3, 3) // keyframe at or before the target
        expect(seg.end).toBeCloseTo(START + 5, 3) // first keyframe at least 2 s later
        expect(seg.last).toBe(false)
        const vp = await packetsOf(new Uint8Array([...seg.video.init, ...seg.video.media]), 'video')
        expect(vp).toHaveLength(20)
        expect(vp[0].timestamp).toBeCloseTo(START + 3, 3)
        expect(vp[0].type).toBe('key')
        const ap = await packetsOf(new Uint8Array([...seg.audio!.init, ...seg.audio!.media]), 'audio')
        expect(ap[0].timestamp).toBeCloseTo(START + 3, 2)
        expect(ap[ap.length - 1].timestamp).toBeLessThan(START + 5)
        expect(ap).toHaveLength(100)
        r.source.dispose()
    })

    it('marks the final piece and ends at the end of the file', async () => {
        const r = await openMseSource(await fixture())
        if (!r.ok) throw new Error(r.reason)
        const seg = await buildSegment(r.source, START + 9.5, 2, new AbortController().signal)
        expect(seg.last).toBe(true)
        expect(seg.start).toBeCloseTo(START + 9, 3)
        expect(seg.end).toBeCloseTo(START + 10, 2)
        r.source.dispose()
    })

    it('stops when aborted', async () => {
        const r = await openMseSource(await fixture())
        if (!r.ok) throw new Error(r.reason)
        const c = new AbortController()
        c.abort()
        await expect(buildSegment(r.source, START, 2, c.signal)).rejects.toThrow()
        r.source.dispose()
    })

    it('splits the init segment from the first moof', () => {
        const box = (type: string, n: number) => { const b = new Uint8Array(n); new DataView(b.buffer).setUint32(0, n); b.set([...type].map((c) => c.charCodeAt(0)), 4); return b }
        const bytes = new Uint8Array([...box('ftyp', 16), ...box('moov', 24), ...box('moof', 12), ...box('mdat', 20)])
        const s = splitInit(bytes)
        expect(s.init).toHaveLength(40)
        expect(s.media).toHaveLength(32)
    })
})
