import { describe, it, expect } from 'vitest'
import { wrapNote } from './layout'
import { estimateTextWidth } from './themes/shooot/layout'

describe('wrapNote', () => {
    const joke = 'LAURIE WAITS PATIENTLY FOR HARRY TO DO HIS LACES (FORESHADOWING)'

    it('should keep a short note on one line', () => {
        expect(wrapNote('TOP BINS', 600, 30, estimateTextWidth)).toEqual(['TOP BINS'])
    })

    it('should split at a word boundary onto two lines when one is not enough', () => {
        const lines = wrapNote(joke, 600, 30, estimateTextWidth)
        expect(lines).toHaveLength(2)
        expect(lines.join(' ')).toBe(joke)
        for (const l of lines) expect(estimateTextWidth(l, 30)).toBeLessThanOrEqual(600)
    })

    it('should end the second line with an ellipsis only when the text cannot fit two lines', () => {
        const lines = wrapNote(joke, 400, 30, estimateTextWidth)
        expect(lines).toHaveLength(2)
        expect(lines[1].endsWith('…')).toBe(true)
        expect(lines[0].endsWith('…')).toBe(false)
        expect(estimateTextWidth(lines[1], 30)).toBeLessThanOrEqual(400)
    })

    it('should return one empty line for an empty note and break a word wider than the line', () => {
        expect(wrapNote('  ', 600, 30, estimateTextWidth)).toEqual([''])
        const lines = wrapNote('SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 300, 30, estimateTextWidth)
        expect(lines).toHaveLength(2)
        for (const l of lines) expect(estimateTextWidth(l, 30)).toBeLessThanOrEqual(300)
    })
})
