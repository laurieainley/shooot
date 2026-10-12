import { describe, it, expect } from 'vitest'
import { eventRowParts } from './eventRow'

describe('eventRowParts', () => {
    it('should give the person and the short note, never an assist', () => {
        const p = eventRowParts({ type: 'goal', scorer: ' James ', notes: 'top corner', assist: 'Joe' } as never)
        expect(p).toEqual({ person: 'James', note: 'top corner', title: 'Goal · James · top corner' })
    })
    it('should leave person and note undefined when absent', () => {
        expect(eventRowParts({ type: 'save' })).toEqual({ person: undefined, note: undefined, title: 'Save' })
    })
})
