// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { SORT_ORDERS, loadSortOrder, saveSortOrder, sortMatches, type SortableMatch } from './matchSort'

const m = (id: string, title: string, dateMs: number, updatedAt: number): SortableMatch => ({ id, updatedAt, summary: { title, dateMs } })
const list = [m('b', 'Bravo', 200, 50), m('a', 'alpha', 300, 10), m('c', 'Charlie', 100, 90)]
const ids = (l: SortableMatch[]): string => l.map((x) => x.id).join('')

describe('sortMatches', () => {
    it('should sort by match date', () => {
        expect(ids(sortMatches(list, 'newest'))).toBe('abc')
        expect(ids(sortMatches(list, 'oldest'))).toBe('cba')
    })
    it('should sort by last edited', () => {
        expect(ids(sortMatches(list, 'edited'))).toBe('cba')
        expect(ids(sortMatches(list, 'least-edited'))).toBe('abc')
    })
    it('should sort by title ignoring case', () => {
        expect(ids(sortMatches(list, 'az'))).toBe('abc')
        expect(ids(sortMatches(list, 'za'))).toBe('cba')
    })
    it('should not mutate the input', () => {
        const copy = [...list]
        sortMatches(list, 'az')
        expect(list).toEqual(copy)
    })
    it('should break ties by id so the order is stable', () => {
        expect(ids(sortMatches([m('y', 'X', 1, 1), m('x', 'X', 1, 1)], 'newest'))).toBe('xy')
    })
})

describe('sort order storage', () => {
    it('should default to last edited, the old behaviour', () => {
        localStorage.clear()
        expect(loadSortOrder()).toBe('edited')
    })
    it('should round-trip and ignore junk', () => {
        saveSortOrder('za')
        expect(loadSortOrder()).toBe('za')
        localStorage.setItem('shooot-match-sort', 'nope')
        expect(loadSortOrder()).toBe('edited')
        expect(SORT_ORDERS).toHaveLength(6)
    })
})
