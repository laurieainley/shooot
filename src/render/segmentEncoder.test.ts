import { describe, it, expect, afterEach, vi } from 'vitest'
import { encoderCandidates, probeEncoders } from './segmentEncoder'
import { VT_HVCC, hex } from './nal.fixtures'

describe('encoderCandidates', () => {
    it('should try the footage codec string first, then generic ones', () => {
        const c = encoderCandidates('hvc1.1.6.L120.90', true)
        expect(c[0]).toBe('hvc1.1.6.L120.90')
        expect(c).toContain('hvc1.1.6.L123.B0')
        expect(new Set(c).size).toBe(c.length)
        expect(encoderCandidates('avc1.64001e', false)[0]).toBe('avc1.64001e')
    })
})

describe('probeEncoders', () => {
    const g = globalThis as Record<string, unknown>
    afterEach(() => {
        delete g.VideoEncoder
        delete g.VideoFrame
        delete g.OffscreenCanvas
    })

    it('should skip unsupported configs and yield a setup with the encoder parameter sets', async () => {
        const supported = vi.fn(async (c: VideoEncoderConfig) => ({ supported: c.codec === 'hvc1.1.6.L123.B0' }))
        class FakeEncoder {
            static isConfigSupported = supported
            encodeQueueSize = 0
            private out: (c: unknown, m: unknown) => void
            constructor(init: { output: (c: unknown, m: unknown) => void }) { this.out = init.output }
            configure(): void {}
            encode(): void {
                this.out({ type: 'key', timestamp: 0, duration: 33366, byteLength: 4, copyTo: (d: Uint8Array) => d.set([0, 0, 0, 0]) },
                    { decoderConfig: { codec: 'hvc1.1.6.L123.B0', description: hex(VT_HVCC), codedWidth: 1920, codedHeight: 1080 } })
            }
            async flush(): Promise<void> {}
            close(): void {}
        }
        g.VideoEncoder = FakeEncoder
        g.VideoFrame = class { close(): void {} }
        g.OffscreenCanvas = class { getContext(): unknown { return { fillRect: () => undefined } } }

        const it = probeEncoders({ codec: 'hvc1.1.6.L120.90', hevc: true, width: 1920, height: 1080, frameRate: 29.97, bitrate: 8e6 })
        const first = await it.next()
        expect(first.done).toBe(false)
        const setup = first.value!
        expect(setup.config.codec).toBe('hvc1.1.6.L123.B0')
        expect(setup.limits).toMatchObject({ codedWidth: 1920, codedHeight: 1088 })
        expect(setup.params).toHaveLength(3)
        expect(setup.nalLength).toBe(4)
        expect(supported.mock.calls[0][0].codec).toBe('hvc1.1.6.L120.90')
    })

    it('should yield nothing without WebCodecs', async () => {
        const r = await probeEncoders({ codec: 'avc1.64001e', hevc: false, width: 768, height: 432, frameRate: 30, bitrate: 2e6 }).next()
        expect(r.done).toBe(true)
    })
})
