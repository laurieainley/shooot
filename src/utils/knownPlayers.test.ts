import { describe, it, expect } from 'vitest'
import { forgetPlayer, rememberPlayers, suggestPlayers, MAX_KNOWN_PLAYERS, type KnownPlayer } from './knownPlayers'

const p = (name: string, lastUsed: number): KnownPlayer => ({ name, lastUsed })

describe('rememberPlayers', () => {
    it('should add new names with the given time', () => {
        expect(rememberPlayers([], ['Jo', 'Sam'], 5)).toEqual([p('Jo', 5), p('Sam', 5)])
    })
    it('should match ignoring case, keeping the newest spelling and time', () => {
        expect(rememberPlayers([p('jo', 1)], ['Jo'], 9)).toEqual([p('Jo', 9)])
    })
    it('should return the same list when nothing changes', () => {
        const list = [p('Jo', 1)]
        expect(rememberPlayers(list, [], 9)).toBe(list)
    })
    it('should skip blank names', () => {
        expect(rememberPlayers([], ['  ', ''], 1)).toEqual([])
    })
    it('should cap the list, dropping the oldest', () => {
        const list = Array.from({ length: MAX_KNOWN_PLAYERS }, (_, i) => p(`P${i}`, i + 10))
        const out = rememberPlayers(list, ['New'], 1000)
        expect(out).toHaveLength(MAX_KNOWN_PLAYERS)
        expect(out.some((x) => x.name === 'P0')).toBe(false)
        expect(out.some((x) => x.name === 'New')).toBe(true)
    })
})

describe('forgetPlayer', () => {
    it('should remove a name ignoring case', () => {
        expect(forgetPlayer([p('Jo', 1), p('Sam', 2)], 'jo')).toEqual([p('Sam', 2)])
    })
})

describe('suggestPlayers', () => {
    const list = [p('Mojo', 5), p('Big John', 4), p('Jo', 1), p('Joe', 3), p('Émile', 2)]
    it('should list the most recent first for an empty draft, without excluded names', () => {
        expect(suggestPlayers(list, '', ['mojo'])).toEqual(['Big John', 'Joe', 'Émile', 'Jo'])
    })
    it('should match whole-name prefixes first, then word starts, never mid-word', () => {
        expect(suggestPlayers(list, 'jo', [])).toEqual(['Joe', 'Jo', 'Big John'])
    })
    it('should ignore accents and case', () => {
        expect(suggestPlayers(list, 'EMI', [])).toEqual(['Émile'])
        expect(suggestPlayers([p('Emile', 1)], 'é', [])).toEqual(['Emile'])
    })
    it('should respect the limit', () => {
        expect(suggestPlayers(list, '', [], 2)).toHaveLength(2)
    })
})
