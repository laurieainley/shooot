import { describe, it, expect } from 'vitest'
import { parseBulkLine, parseBulkPaste, previewBulkPaste } from './bulkPaste'

describe('parseBulkLine', () => {
    it('should parse MM:SS Team - Scorer into a goal in the given file', () => {
        expect(parseBulkLine('07:12 Whites - Sam Taylor', 1)).toMatchObject({
            matchTimeSec: 432, team: 'Whites', scorer: 'Sam Taylor', sourceFileIndex: 1, type: 'goal',
        })
    })

    it('should accept plain seconds, an en dash and double-space separators', () => {
        expect(parseBulkLine('90', 0)).toMatchObject({ matchTimeSec: 90, team: undefined, scorer: undefined })
        expect(parseBulkLine('1:05 Colours – Jo', 0)).toMatchObject({ matchTimeSec: 65, team: 'Colours', scorer: 'Jo' })
        expect(parseBulkLine('2:00 Whites  Priya', 0)).toMatchObject({ team: 'Whites', scorer: 'Priya' })
    })

    it('should return null for blank lines and lines without a leading time', () => {
        expect(parseBulkLine('   ', 0)).toBeNull()
        expect(parseBulkLine('Whites - Sam', 0)).toBeNull()
    })

    it('should give every parsed event a unique id', () => {
        const a = parseBulkLine('1:00', 0)!
        const b = parseBulkLine('1:00', 0)!
        expect(a.id).not.toBe(b.id)
    })
})

describe('parseBulkPaste', () => {
    it('should parse each valid line and skip the rest', () => {
        const out = parseBulkPaste('07:12 Whites - Sam\n\nnonsense\r\n23:41 Colours - Jo', 0)
        expect(out.map((e) => [e.matchTimeSec, e.team, e.scorer])).toEqual([[432, 'Whites', 'Sam'], [1421, 'Colours', 'Jo']])
    })
})

describe('parseBulkLine hours', () => {
    it('should read H:MM:SS as hours, minutes and seconds', () => {
        expect(parseBulkLine('1:02:03 Whites - Sam', 0)).toMatchObject({ matchTimeSec: 3723, team: 'Whites', scorer: 'Sam' })
    })
})

describe('previewBulkPaste', () => {
    it('should list every non-blank line, flagging the ones without a time', () => {
        const rows = previewBulkPaste('07:12 Whites - Sam\n\nnonsense\n90', 2)
        expect(rows.map((r) => [r.n, r.raw, r.event?.matchTimeSec ?? null])).toEqual([[1, '07:12 Whites - Sam', 432], [3, 'nonsense', null], [4, '90', 90]])
        expect(rows[0].event?.sourceFileIndex).toBe(2)
    })
})
