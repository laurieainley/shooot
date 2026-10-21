import { describe, it, expect } from 'vitest'
import { abortable, anyAbort } from './abortable'

describe('abortable', () => {
    it('should pass the value through when the promise settles first', async () => {
        const ctl = new AbortController()
        await expect(abortable(Promise.resolve(3), ctl.signal)).resolves.toBe(3)
    })
    it('should pass a rejection through', async () => {
        await expect(abortable(Promise.reject(new Error('x')), new AbortController().signal)).rejects.toThrow('x')
    })
    it('should reject with an AbortError when the signal aborts while the promise never settles', async () => {
        const ctl = new AbortController()
        const p = abortable(new Promise<number>(() => {}), ctl.signal)
        ctl.abort()
        await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    })
    it('should reject at once when the signal is already aborted, and swallow the late rejection', async () => {
        const ctl = new AbortController()
        ctl.abort()
        await expect(abortable(Promise.reject(new Error('late')), ctl.signal)).rejects.toMatchObject({ name: 'AbortError' })
    })
    it('should return the promise itself without a signal', async () => {
        await expect(abortable(Promise.resolve(1))).resolves.toBe(1)
    })
})

describe('anyAbort', () => {
    it('should abort when any one of the signals does', () => {
        const a = new AbortController()
        const b = new AbortController()
        const any = anyAbort(a.signal, undefined, b.signal)
        expect(any.signal.aborted).toBe(false)
        b.abort()
        expect(any.signal.aborted).toBe(true)
    })
    it('should start aborted when one already is', () => {
        const a = new AbortController()
        a.abort()
        expect(anyAbort(a.signal).signal.aborted).toBe(true)
    })
    it('should stop listening once disposed', () => {
        const a = new AbortController()
        const any = anyAbort(a.signal)
        any.dispose()
        a.abort()
        expect(any.signal.aborted).toBe(false)
    })
})
