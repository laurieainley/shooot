import { describe, expect, it } from 'vitest'
import { Gate } from './gate'

describe('Gate', () => {
    it('should let as many through as the limit allows and the next in as one ends', async () => {
        const g = new Gate(2)
        const a = await g.acquire()
        const b = await g.acquire()
        let third = false
        const c = g.acquire().then((r) => { third = true; return r })
        await Promise.resolve()
        expect(third).toBe(false)
        a()
        const rc = await c
        expect(third).toBe(true)
        expect(g.active).toBe(2)
        b(); rc()
        expect(g.active).toBe(0)
    })
    it('should follow a limit that changes while units wait (1 while playing, 0 to hold)', async () => {
        const g = new Gate(1)
        const a = await g.acquire()
        let second = false
        void g.acquire().then(() => { second = true })
        g.setLimit(2)
        await Promise.resolve(); await Promise.resolve()
        expect(second).toBe(true)
        g.setLimit(0)
        let third = false
        void g.acquire().then(() => { third = true })
        a()
        await Promise.resolve(); await Promise.resolve()
        expect(third).toBe(false)
        g.setLimit(3)
        await Promise.resolve(); await Promise.resolve()
        expect(third).toBe(true)
    })
    it('should reject a waiting unit when its signal aborts, and ignore a double release', async () => {
        const g = new Gate(0)
        const ctl = new AbortController()
        const p = g.acquire(ctl.signal)
        ctl.abort()
        await expect(p).rejects.toMatchObject({ name: 'AbortError' })
        await expect(g.acquire(ctl.signal)).rejects.toMatchObject({ name: 'AbortError' })
        g.setLimit(1)
        const r = await g.acquire()
        r(); r()
        expect(g.active).toBe(0)
    })
})
