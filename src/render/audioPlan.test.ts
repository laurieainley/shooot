import { describe, it, expect } from 'vitest'
import { planAudio } from './audioPlan'

const aac = { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 }

describe('planAudio', () => {
    it('should have no audio when no clip has any', () => {
        expect(planAudio([null, null])).toEqual({ ok: true, reference: null })
    })

    it('should use the first clip that has audio as the reference', () => {
        expect(planAudio([null, aac, aac])).toEqual({ ok: true, reference: 1 })
    })

    it('should accept clips with and without audio together (the silent ones get silence)', () => {
        expect(planAudio([aac, null])).toEqual({ ok: true, reference: 0 })
    })

    it('should reject clips with different audio formats', () => {
        expect(planAudio([aac, { ...aac, sampleRate: 44100 }])).toEqual({ ok: false })
        expect(planAudio([aac, { ...aac, numberOfChannels: 1 }])).toEqual({ ok: false })
    })

    it('should treat an empty list as no audio', () => {
        expect(planAudio([])).toEqual({ ok: true, reference: null })
    })
})
