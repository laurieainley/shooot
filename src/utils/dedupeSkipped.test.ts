import { describe, it, expect } from 'vitest'
import { dedupeSkipped } from './dedupeSkipped'

describe('dedupeSkipped', () => {
    it('should list the same label and reason once, keeping order', () => {
        const a = { label: 'Scorebug', reason: 'font' }
        const b = { label: 'Card', reason: 'font' }
        expect(dedupeSkipped([a, b, { ...a }])).toEqual([a, b])
    })
    it('should keep the same label with a different reason', () => {
        expect(dedupeSkipped([{ label: 'A', reason: 'x' }, { label: 'A', reason: 'y' }])).toHaveLength(2)
    })
    it('should return an empty list for no input', () => {
        expect(dedupeSkipped([])).toEqual([])
    })
})
