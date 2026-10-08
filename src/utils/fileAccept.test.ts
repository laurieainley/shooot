import { describe, it, expect } from 'vitest'
import { isAcceptedVideo, FILE_INPUT_ACCEPT, VIDEO_EXTENSIONS, fileInputAccept, isIOS } from './fileAccept'

describe('isAcceptedVideo', () => {
    it('should accept by MIME type', () => {
        expect(isAcceptedVideo('clip', 'video/mp4')).toBe(true)
    })

    it('should accept .mp4 and .lrv by extension when MIME is empty (Android SD card)', () => {
        expect(isAcceptedVideo('GX010226.MP4', '')).toBe(true)
        expect(isAcceptedVideo('GL010226.LRV', '')).toBe(true)
        expect(isAcceptedVideo('x.mp4', 'application/octet-stream')).toBe(true)
    })

    it('should accept MOV and M4V files, by MIME type or extension', () => {
        expect(isAcceptedVideo('IMG_0412.MOV', '')).toBe(true)
        expect(isAcceptedVideo('clip', 'video/quicktime')).toBe(true)
        expect(isAcceptedVideo('holiday.m4v', 'video/x-m4v')).toBe(true)
        expect(isAcceptedVideo('holiday.M4V', '')).toBe(true)
    })

    it('should reject other files', () => {
        expect(isAcceptedVideo('GX010226.THM', '')).toBe(false)
        expect(isAcceptedVideo('notes.txt', 'text/plain')).toBe(false)
    })
})

describe('FILE_INPUT_ACCEPT', () => {
    it('should list extensions only (no MIME wildcards that trigger the Android Photo Picker)', () => {
        expect(FILE_INPUT_ACCEPT).toBe('.mp4,.MP4,.m4v,.M4V,.mov,.MOV,.lrv,.LRV')
    })
})

describe('fileInputAccept', () => {
    const base = { userAgent: 'Mozilla/5.0', platform: 'Win32', maxTouchPoints: 0 }

    it('should keep the extension list on desktop and Android', () => {
        expect(fileInputAccept(base)).toBe(FILE_INPUT_ACCEPT)
        expect(fileInputAccept({ ...base, userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 })).toBe(FILE_INPUT_ACCEPT)
    })

    it('should return no accept on iPhone and iPad user agents', () => {
        expect(fileInputAccept({ ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe('')
        expect(fileInputAccept({ ...base, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })).toBe('')
    })

    it('should treat a touch Mac (iPadOS desktop mode) as iPad, but not a plain Mac', () => {
        expect(fileInputAccept({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('')
        expect(fileInputAccept({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(FILE_INPUT_ACCEPT)
    })
})

describe('isIOS', () => {
    it('should detect iPadOS desktop mode', () => {
        expect(isIOS({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
        expect(isIOS({ userAgent: 'Windows', platform: 'Win32', maxTouchPoints: 10 })).toBe(false)
    })
})

describe('VIDEO_EXTENSIONS', () => {
    it('should list every accepted extension in both cases for the file picker', () => {
        expect(VIDEO_EXTENSIONS).toEqual(['.mp4', '.MP4', '.m4v', '.M4V', '.mov', '.MOV', '.lrv', '.LRV'])
    })
})
