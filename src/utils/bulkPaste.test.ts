import { describe, it, expect } from 'vitest'
import { parseBulkLine, parseBulkPaste } from './bulkPaste'

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
