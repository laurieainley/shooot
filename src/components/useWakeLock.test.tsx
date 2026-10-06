// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWakeLock } from './useWakeLock'

describe('useWakeLock', () => {
    let request: ReturnType<typeof vi.fn>
    let sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[]
    beforeEach(() => {
        sentinels = []
        request = vi.fn(async () => {
            const s = { released: false, release: vi.fn(async () => { s.released = true }) }
            sentinels.push(s)
            return s
        })
        Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    })
    afterEach(() => { Reflect.deleteProperty(navigator, 'wakeLock') })

    it('should hold the screen awake while active and release it after', async () => {
        const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } })
        await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
        rerender({ on: false })
        await waitFor(() => expect(sentinels[0].release).toHaveBeenCalled())
    })

    it('should take the lock again when the page becomes visible (the browser drops it when hidden)', async () => {
        renderHook(() => useWakeLock(true))
        await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
        sentinels[0].released = true
        document.dispatchEvent(new Event('visibilitychange'))
        await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    })

    it('should do nothing where the API is missing', () => {
        Reflect.deleteProperty(navigator, 'wakeLock')
        expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
    })
})
