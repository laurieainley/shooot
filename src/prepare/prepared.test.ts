// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { forgetAllPrepared, forgetPrepared, preparedPercent, rememberPrepared, syncPrepared } from './prepared'

describe('prepared progress memory', () => {
    afterEach(() => { localStorage.clear() })
    it('should show the largest share across kinds, per project', () => {
        expect(preparedPercent('p1')).toBe(0)
        rememberPrepared('p1', 'fullMatch', 's1', '4k', 30)
        rememberPrepared('p1', 'highlights', 'h1', '4k', 80)
        expect(preparedPercent('p1')).toBe(80)
        expect(preparedPercent('p2')).toBe(0)
        expect(preparedPercent(null)).toBe(0)
    })
    it('should forget a kind whose plan signature changed, and keep one whose signature is the same', () => {
        rememberPrepared('p1', 'fullMatch', 's1', '4k', 30)
        syncPrepared('p1', 'fullMatch', 's1')
        expect(preparedPercent('p1')).toBe(30)
        syncPrepared('p1', 'fullMatch', 's2')
        expect(preparedPercent('p1')).toBe(0)
    })
    it('should replace a kind remembered under another signature', () => {
        rememberPrepared('p1', 'fullMatch', 's1', '4k', 90)
        rememberPrepared('p1', 'fullMatch', 's2', '4k', 5)
        expect(preparedPercent('p1')).toBe(5)
    })
    it('should forget one kind, a whole project, or everything', () => {
        rememberPrepared('p1', 'fullMatch', 's1', '4k', 30)
        rememberPrepared('p1', 'highlights', 'h1', '4k', 80)
        rememberPrepared('p2', 'fullMatch', 's1', '4k', 50)
        forgetPrepared('p1', 'highlights')
        expect(preparedPercent('p1')).toBe(30)
        forgetPrepared('p1')
        expect(preparedPercent('p1')).toBe(0)
        expect(preparedPercent('p2')).toBe(50)
        forgetAllPrepared()
        expect(preparedPercent('p2')).toBe(0)
    })
    it('should ignore junk and the old single-number format', () => {
        localStorage.setItem('shooot-prepared:p1', '62')
        expect(preparedPercent('p1')).toBe(0)
        localStorage.setItem('shooot-prepared:p1', '{bad')
        expect(preparedPercent('p1')).toBe(0)
    })
})
