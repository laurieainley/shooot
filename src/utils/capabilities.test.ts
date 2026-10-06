import { describe, it, expect } from 'vitest'
import { graphicsSupport } from './capabilities'

const full = { VideoEncoder: class {}, VideoDecoder: class {}, VideoFrame: class {}, AudioEncoder: class {}, AudioDecoder: class {}, OffscreenCanvas: class {} }

describe('graphicsSupport', () => {
    it('should be ok when every WebCodecs piece is present', () => {
        expect(graphicsSupport(full)).toEqual({ ok: true, missing: [] })
    })

    it('should name what is missing and promise that a plain reel still renders', () => {
        const noAudio = graphicsSupport({ ...full, AudioEncoder: undefined })
        expect(noAudio.ok).toBe(false)
        expect(noAudio.missing).toEqual(['audio encoding'])
        expect(noAudio.message).toMatch(/audio encoding/)
        expect(noAudio.message).toMatch(/still renders/)
    })

    it('should report several gaps together', () => {
        const r = graphicsSupport({})
        expect(r.missing).toEqual(['video encoding', 'audio encoding', 'off-screen drawing'])
    })

    it('should need the video decoder and frames too, not only the encoder', () => {
        expect(graphicsSupport({ ...full, VideoDecoder: undefined }).ok).toBe(false)
        expect(graphicsSupport({ ...full, VideoFrame: undefined }).ok).toBe(false)
    })
})
