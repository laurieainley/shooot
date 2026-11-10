// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCoarsePointer, wakeLockDep } from './wire'

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
})
