import { describe, it, expect } from 'vitest'
import { filesSummary } from './filesSummary'

const full = { kind: 'full' as const, durationSec: 600 }

describe('filesSummary', () => {
    it('should count the files and add up their duration', () => {
        const s = filesSummary([full, full, { ...full, durationSec: 34 }])
        expect(s).toMatchObject({ count: 3, totalSec: 1234, attention: [], label: '3 files · 20:34' })
    })
    it('should use the singular and hours for long footage', () => {
        expect(filesSummary([{ kind: 'full', durationSec: 3725 }]).label).toBe('1 file · 01:02:05')
    })
    it('should say No files when empty, and leave out an unknown duration', () => {
        expect(filesSummary([]).label).toBe('No files')
        expect(filesSummary([{ kind: 'full' }]).label).toBe('1 file')
    })
    it('should flag files that cannot play here', () => {
        expect(filesSummary([full, { ...full, playbackIssue: 'HEVC' }]).attention).toEqual(["1 can't play here"])
    })
    it('should flag proxies without a full file, but not proxies that have one', () => {
        const proxy = { kind: 'proxy' as const, durationSec: 60 }
        expect(filesSummary([proxy]).attention).toHaveLength(1)
        expect(filesSummary([{ ...proxy, fullFile: new File([''], 'a.mp4') }]).attention).toEqual([])
    })
})
