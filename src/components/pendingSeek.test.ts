import { describe, it, expect } from 'vitest'
import { reportedTime, seekNow } from './pendingSeek'

describe('seekNow', () => {
    const waiting = { fileIndex: 0, timeSec: 300, play: true }
    it('should apply a seek in the loaded current file at once', () => {
        expect(seekNow(1, 1, true, null)).toBe(true)
    })
    it('should wait when the seek targets another file', () => {
        expect(seekNow(0, 1, true, null)).toBe(false)
    })
    it('should wait while the current file is still loading or an earlier seek is waiting', () => {
        expect(seekNow(0, 0, false, null)).toBe(false)
        expect(seekNow(0, 0, true, waiting)).toBe(false)
    })
})

describe('reportedTime', () => {
    it('should hold the playhead while a seek waits, so a loading file never shows 0:00', () => {
        expect(reportedTime(0, { fileIndex: 0, timeSec: 300, play: false })).toBeNull()
        expect(reportedTime(12, null)).toBe(12)
    })
})
