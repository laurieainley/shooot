import { describe, it, expect } from 'vitest'
import { unsupportedReason, plausibleRecordingTime } from './footageSupport'

describe('unsupportedReason', () => {
    it('should accept H.264 and HEVC video with AAC audio', () => {
        expect(unsupportedReason('a.mov', { videoCodec: 'hevc', audioCodec: 'aac' })).toBeNull()
        expect(unsupportedReason('a.mp4', { videoCodec: 'avc', audioCodec: 'aac' })).toBeNull()
    })

    it('should accept footage without an audio track', () => {
        expect(unsupportedReason('a.mp4', { videoCodec: 'avc', audioCodec: null })).toBeNull()
    })

    it('should name an unsupported video codec', () => {
        expect(unsupportedReason('a.mov', { videoCodec: 'prores', audioCodec: 'aac' })).toBe('a.mov: ProRes video is not supported (use H.264 or HEVC)')
        expect(unsupportedReason('a.mp4', { videoCodec: 'av1', audioCodec: 'aac' })).toBe('a.mp4: AV1 video is not supported (use H.264 or HEVC)')
    })

    it('should say when there is no video track at all', () => {
        expect(unsupportedReason('a.mp4', { videoCodec: null, audioCodec: 'aac' })).toBe('a.mp4: no H.264/HEVC video track')
    })

    it('should name an unsupported audio codec', () => {
        expect(unsupportedReason('a.mov', { videoCodec: 'avc', audioCodec: 'pcm-s16' })).toBe('a.mov: PCM audio is not supported (use AAC)')
        expect(unsupportedReason('a.mp4', { videoCodec: 'avc', audioCodec: 'opus' })).toBe('a.mp4: Opus audio is not supported (use AAC)')
    })
})

describe('plausibleRecordingTime', () => {
    it('should return the date in ms', () => {
        expect(plausibleRecordingTime(new Date('2026-10-04T10:00:00Z'))).toBe(Date.parse('2026-10-04T10:00:00Z'))
    })

    it('should ignore missing, invalid and epoch/1904 placeholder dates', () => {
        expect(plausibleRecordingTime(undefined)).toBeUndefined()
        expect(plausibleRecordingTime(new Date('nope'))).toBeUndefined()
        expect(plausibleRecordingTime(new Date(0))).toBeUndefined()
        expect(plausibleRecordingTime(new Date('1904-01-01T00:00:00Z'))).toBeUndefined()
    })
})
