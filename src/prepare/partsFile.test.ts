import { describe, expect, it } from 'vitest'
import { isPartsFile, isPartsFileName, loadOutcome, needsReplace, partsFileName, skippedNote } from './partsFile'
import type { MatchEvent, Team } from '../types'

const teams = [{ name: 'Whites' }, { name: 'Colours' }] as Team[]
const ev = (id: string): MatchEvent => ({ id, matchTimeSec: 5, sourceFileIndex: 0, type: 'goal' }) as MatchEvent
const result = (o: Partial<Parameters<typeof loadOutcome>[0]> = {}): Parameters<typeof loadOutcome>[0] => ({
    project: null, imported: 0, refused: null, device: 'Android phone', cancelled: false, skipped: { space: 0, damaged: 0, failed: 0 }, ...o,
})

describe('parts file names', () => {
    it('should know a parts file by its extension, in any case', () => {
        expect(isPartsFileName('Whites v Colours · prepared parts.shooot-parts')).toBe(true)
        expect(isPartsFileName('X.SHOOOT-PARTS')).toBe(true)
        expect(isPartsFileName('GX010042.MP4')).toBe(false)
        expect(isPartsFileName('project.json')).toBe(false)
    })
    it('should know a parts file by its magic bytes whatever its name, and by its name when it cannot be read', async () => {
        const magic = new TextEncoder().encode('shooot-parts\n')
        expect(await isPartsFile(new File([magic, 'rest'], 'prepared parts.bin'))).toBe(true)
        expect(await isPartsFile(new File([magic], 'noext'))).toBe(true)
        expect(await isPartsFile(new File(['shooot-partsX'], 'x.mp4'))).toBe(false)
        expect(await isPartsFile(new File([], 'empty.mp4'))).toBe(false)
        const unreadable = new File(['x'], 'a.shooot-parts')
        Object.defineProperty(unreadable, 'slice', { value: () => { throw new Error('gone') } })
        expect(await isPartsFile(unreadable)).toBe(true)
    })
    it('should name the file after the match', () => {
        expect(partsFileName({ title: 'Matchday 3', teams })).toBe('Matchday 3 - Whites v Colours · prepared parts.shooot-parts')
        expect(partsFileName({ title: null, teams })).toBe('Whites v Colours · prepared parts.shooot-parts')
        expect(partsFileName({ title: 'A/B: final', teams: [] })).toBe('A B final · prepared parts.shooot-parts')
        expect(partsFileName({ title: '  ', teams: [] })).toBe('Match · prepared parts.shooot-parts')
    })
})

describe('replacing the open project', () => {
    it('should ask only when both sides have events and they differ (same rule as a project file)', () => {
        expect(needsReplace([], [ev('a')])).toBe(false)
        expect(needsReplace([ev('a')], [])).toBe(false)
        expect(needsReplace([ev('a')], [ev('a')])).toBe(false)
        expect(needsReplace([ev('a')], [ev('b')])).toBe(true)
    })
})

describe('what a load says', () => {
    it('should say the skipped parts in plain words', () => {
        expect(skippedNote({ space: 0, damaged: 3, failed: 0 })).toBe('3 parts were damaged and will be encoded here.')
        expect(skippedNote({ space: 1, damaged: 0, failed: 0 })).toBe('1 part did not fit in this browser’s storage and will be encoded here.')
        expect(skippedNote({ space: 0, damaged: 1, failed: 2 })).toBe('1 part was damaged and will be encoded here. 2 parts could not be stored and will be encoded here.')
        expect(skippedNote({ space: 0, damaged: 0, failed: 0 })).toBeNull()
    })
    it('should toast the parts loaded and keep problems on screen', () => {
        expect(loadOutcome(result({ imported: 12 }))).toEqual({ toast: 'Loaded 12 prepared parts from Android phone', notice: null })
        expect(loadOutcome(result({ imported: 1, device: 'iPad' }))).toEqual({ toast: 'Loaded 1 prepared part from iPad', notice: null })
        expect(loadOutcome(result({ imported: 9, skipped: { space: 0, damaged: 3, failed: 0 } }))).toEqual({ toast: 'Loaded 9 prepared parts from Android phone', notice: '3 parts were damaged and will be encoded here.' })
    })
    it('should show a refusal verbatim', () => {
        const refused = 'These prepared parts were made by a different version of the app, so they were skipped. The project was loaded.'
        expect(loadOutcome(result({ refused }))).toEqual({ toast: null, notice: refused })
    })
    it('should say when loading was stopped or the file held nothing', () => {
        expect(loadOutcome(result({ imported: 4, cancelled: true })).notice).toBe('Loading stopped: 4 prepared parts were loaded, the rest will be encoded here.')
        expect(loadOutcome(result({ imported: 4, cancelled: true })).toast).toBeNull()
        expect(loadOutcome(result()).notice).toBe('This file has no prepared parts in it.')
    })
})
