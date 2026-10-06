import { describe, it, expect } from 'vitest'
import { largeFileHint, LARGE_FILE_BYTES } from './pickerHint'

describe('largeFileHint', () => {
    const GB = 1024 ** 3
    it('should explain the iPadOS copy delay when a picked file is over 2 GB on iOS', () => {
        const hint = largeFileHint(true, [1 * GB, 3 * GB])
        expect(hint).toMatch(/iPadOS copies files/)
        expect(hint).toMatch(/\.LRV/)
    })
    it('should say nothing when all files are small or the device is not iOS', () => {
        expect(largeFileHint(true, [LARGE_FILE_BYTES, 10])).toBeNull()
        expect(largeFileHint(false, [5 * GB])).toBeNull()
        expect(largeFileHint(true, [])).toBeNull()
    })
})
