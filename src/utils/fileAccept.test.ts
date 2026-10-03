import { describe, it, expect } from 'vitest'
import { isAcceptedVideo, FILE_INPUT_ACCEPT } from './fileAccept'

describe('isAcceptedVideo', () => {
    it('should accept by MIME type', () => {
        expect(isAcceptedVideo('clip', 'video/mp4')).toBe(true)
    })

    it('should accept .mp4 and .lrv by extension when MIME is empty (Android SD card)', () => {
        expect(isAcceptedVideo('GX010226.MP4', '')).toBe(true)
        expect(isAcceptedVideo('GL010226.LRV', '')).toBe(true)
        expect(isAcceptedVideo('x.mp4', 'application/octet-stream')).toBe(true)
    })

    it('should reject other files', () => {
        expect(isAcceptedVideo('GX010226.THM', '')).toBe(false)
        expect(isAcceptedVideo('notes.txt', 'text/plain')).toBe(false)
    })
})

describe('FILE_INPUT_ACCEPT', () => {
    it('should list extensions only (no MIME wildcards that trigger the Android Photo Picker)', () => {
        expect(FILE_INPUT_ACCEPT).toBe('.mp4,.MP4,.lrv,.LRV')
    })
})
