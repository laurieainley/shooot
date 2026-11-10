// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCoarsePointer, preparedPercent, rememberPrepared, wakeLockDep } from './wire'
import { appPreparer } from './wire'

const media = (coarse: boolean): void => { vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse') ? coarse : false, addEventListener: () => undefined, removeEventListener: () => undefined })) }

describe('prepare wiring on touch', () => {
    afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
    it('should pass no wake lock with a fine pointer, and one with a coarse pointer', () => {
        media(false)
        expect(isCoarsePointer()).toBe(false)
        expect(wakeLockDep()).toBeUndefined()
        media(true)
        expect(isCoarsePointer()).toBe(true)
        const make = wakeLockDep()
        expect(make).toBeTypeOf('function')
        const lock = make!()
        expect(lock.acquire).toBeTypeOf('function')
        expect(lock.release).toBeTypeOf('function')
    })
    it('should remember how much was prepared per project, for the relink banner after a reload', () => {
        expect(preparedPercent('p1')).toBe(0)
        rememberPrepared('p1', 42)
        expect(preparedPercent('p1')).toBe(42)
        expect(preparedPercent('p2')).toBe(0)
        expect(preparedPercent(null)).toBe(0)
    })
    it('should prefer the live share of this session', () => {
        rememberPrepared('p1', 10)
        const state = { totalUnits: 10, readyUnits: 5, totalSec: 100, readySec: 50, intro: true, outro: true, cuts: [] }
        appPreparer().store.setState({ shares: { fullMatch: { quality: '4k', signature: 's', state } } })
        expect(preparedPercent('p1')).toBe(50)
        appPreparer().store.setState({ shares: {} })
    })
})
