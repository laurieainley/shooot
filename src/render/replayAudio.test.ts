import { describe, it, expect } from 'vitest'
import { applyGain, encodeReplayAudio, fitFrames, leadingChunksToDrop } from './replayAudio'
import type { InputAudioTrack } from 'mediabunny'

describe('fitFrames', () => {
    it('should pad with silence or trim to the wanted frame count (interleaved)', () => {
        expect(Array.from(fitFrames(new Float32Array([1, 2, 3, 4]), 2, 3))).toEqual([1, 2, 3, 4, 0, 0])
        expect(Array.from(fitFrames(new Float32Array([1, 2, 3, 4, 5, 6]), 2, 2))).toEqual([1, 2, 3, 4])
    })
})

describe('applyGain', () => {
    it('should scale every sample in place', () => {
        const x = new Float32Array([1, -0.5, 0.25])
        applyGain(x, 0.5)
        expect(Array.from(x)).toEqual([0.5, -0.25, 0.125])
    })
})

describe('leadingChunksToDrop', () => {
    it('should drop chunks stamped before zero (encoder priming)', () => {
        expect(leadingChunksToDrop([-42_666, -21_333, 0, 21_333, 42_666], 3)).toBe(2)
    })

    it('should otherwise drop the surplus at the start when the encoder delays the signal', () => {
        expect(leadingChunksToDrop([0, 21_333, 42_666, 64_000], 3)).toBe(1)
        expect(leadingChunksToDrop([0, 21_333, 42_666], 3)).toBe(0)
    })

    it('should never drop more than the surplus', () => {
        expect(leadingChunksToDrop([-1, -1, -1, 0], 3)).toBe(1)
    })
})

describe('encodeReplayAudio', () => {
    it('should resolve to null when the browser has no WebCodecs audio', async () => {
        expect(typeof globalThis.AudioEncoder).toBe('undefined')
        const track = { codec: 'aac', sampleRate: 48000, numberOfChannels: 2, canDecode: async () => true } as unknown as InputAudioTrack
        await expect(encodeReplayAudio(track, { startSec: 0, endSec: 1, speed: 0.5, gain: 0.5, outDurationSec: 2 })).resolves.toBeNull()
    })
})
