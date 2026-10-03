import { describe, it, expect } from 'vitest'
import { makeSilentAudio } from './silentAudio'

describe('makeSilentAudio', () => {
    it('should resolve to null when the browser has no AudioEncoder', async () => {
        expect(typeof globalThis.AudioEncoder).toBe('undefined')
        await expect(makeSilentAudio({ sampleRate: 48000, numberOfChannels: 2 })).resolves.toBeNull()
    })
})
