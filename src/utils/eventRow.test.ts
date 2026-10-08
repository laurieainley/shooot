import { describe, it, expect } from 'vitest'
import { eventRowParts } from './eventRow'

describe('eventRowParts', () => {
    it('should split a goal into person, labelled assist and no note', () => {
        const p = eventRowParts({ type: 'goal', scorer: 'James', assist: 'Joe' })
        expect(p.person).toBe('James')
        expect(p.sub).toEqual(['Assist: Joe'])
    })

    it('should append the note after the assist', () => {
        const p = eventRowParts({ type: 'goal', scorer: 'James', assist: 'Joe', notes: 'long range' })
        expect(p.sub).toEqual(['Assist: Joe', '— long range'])
    })

    it('should give a highlight with only a note a single sub part', () => {
        const p = eventRowParts({ type: 'highlight', notes: 'nutmeg on the wing' })
        expect(p.person).toBeUndefined()
        expect(p.sub).toEqual(['— nutmeg on the wing'])
    })

    it('should drop the assist on penalties and own goals', () => {
        expect(eventRowParts({ type: 'goal', pen: true, scorer: 'Sam', assist: 'Jo' }).sub).toEqual([])
        expect(eventRowParts({ type: 'own_goal', scorer: 'Sam', assist: 'Jo' }).sub).toEqual([])
    })

    it('should build a full title with every part', () => {
        const p = eventRowParts({ type: 'goal', scorer: 'James', assist: 'Joe', notes: 'x' })
        expect(p.title).toBe('Goal · James · Assist: Joe — x')
    })

    it('should have no person or sub for a bare event', () => {
        const p = eventRowParts({ type: 'save' })
        expect(p).toMatchObject({ person: undefined, sub: [] })
    })
})
