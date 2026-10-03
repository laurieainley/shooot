import { describe, it, expect } from 'vitest'
import { fileKey } from './fileKey'

describe('fileKey', () => {
    it('should use the file name', () => {
        expect(fileKey('match-1.mp4')).toBe('match-1.mp4')
    })
})
