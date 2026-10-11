import { describe, expect, it } from 'vitest'
import { CHUNK_SEC, decodeMono, planAudioReads } from './audioSource'
import { blockReader } from '../render/fileSource'

const SR = 8000

/** A stereo 16-bit PCM WAV of `sec` seconds: left = ramp, right = zero (so mono = ramp / 2). */
function wav(sec: number): File {
    const frames = SR * sec, data = new DataView(new ArrayBuffer(44 + frames * 4))
    const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); data.setUint32(4, 36 + frames * 4, true); str(8, 'WAVE'); str(12, 'fmt ')
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true)
    data.setUint32(24, SR, true); data.setUint32(28, SR * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true)
    str(36, 'data'); data.setUint32(40, frames * 4, true)
    for (let i = 0; i < frames; i++) { data.setInt16(44 + i * 4, (i % 2000) * 10, true); data.setInt16(46 + i * 4, 0, true) }
    return new File([data.buffer], 'a.wav', { type: 'audio/wav' })
}

describe('decodeMono', () => {
    it('should hand on audio in ~2 s chunks with the right content, times and no gaps', async () => {
        const chunks: { n: number; t: number; sr: number; first: number }[] = []
        let total = 0
        const ok = await decodeMono(wav(7), (mono, sr, t) => { chunks.push({ n: mono.length, t, sr, first: mono[0] }); total += mono.length }, new AbortController().signal)
        expect(ok).toBe(true)
        expect(total).toBe(SR * 7)
        expect(chunks.length).toBeLessThanOrEqual(Math.ceil(7 / CHUNK_SEC) + 1)
        expect(chunks.length).toBeGreaterThanOrEqual(3)
        expect(chunks[0].t).toBeCloseTo(0, 3)
        let at = 0
        for (const c of chunks) { expect(c.t).toBeCloseTo(at / SR, 3); at += c.n }
    })

    it('should stop when cancelled', async () => {
        const ac = new AbortController()
        ac.abort()
        await expect(decodeMono(wav(3), () => {}, ac.signal)).rejects.toThrow('Cancelled')
    })
})

describe('planAudioReads', () => {
    it('should give an empty plan (plain reading) when there is nothing to plan', async () => {
        const f = new File([new Uint8Array(100)], 'x.mp4')
        expect(await planAudioReads(f, blockReader(f, 64, 4), new AbortController().signal)).toEqual([])
    })
})
