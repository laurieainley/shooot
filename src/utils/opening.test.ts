import { describe, it, expect } from 'vitest'
import { formatBytes, openingLabel } from './opening'

describe('formatBytes', () => {
    it('should use decimal units with one decimal above a kilobyte', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(1500)).toBe('1.5 KB')
        expect(formatBytes(48_200_000)).toBe('48.2 MB')
        expect(formatBytes(11_900_000_000)).toBe('11.9 GB')
    })
})

describe('openingLabel', () => {
    it('should name the file and its size', () => {
        expect(openingLabel('GX010226.MP4', 11_900_000_000)).toBe('Opening GX010226.MP4 (11.9 GB)…')
    })

    it('should mention how many more files are queued', () => {
        expect(openingLabel('GX010226.MP4', 11_900_000_000, 2)).toBe('Opening GX010226.MP4 (11.9 GB)… +2 more')
    })
})
