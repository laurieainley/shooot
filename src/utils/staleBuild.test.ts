import { describe, it, expect } from 'vitest'
import { isStaleChunkError, shouldReload } from './staleBuild'

describe('isStaleChunkError', () => {
    it('should recognise the messages browsers give when a lazily loaded file from an older deploy is gone', () => {
        expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/index-DrJsrOVe.js'))).toBe(true)
        expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
        expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true)
        expect(isStaleChunkError("Unable to preload CSS for /assets/a.css")).toBe(true)
    })

    it('should ignore other errors', () => {
        expect(isStaleChunkError(new Error('Clips use different video codecs'))).toBe(false)
        expect(isStaleChunkError(undefined)).toBe(false)
    })
})

describe('shouldReload', () => {
    it('should reload when it has not just reloaded for the same reason', () => {
        expect(shouldReload(null, 1_000_000)).toBe(true)
        expect(shouldReload(1_000_000 - 120_000, 1_000_000)).toBe(true)
    })

    it('should not reload again within a minute (avoids a reload loop)', () => {
        expect(shouldReload(1_000_000 - 30_000, 1_000_000)).toBe(false)
    })
})
