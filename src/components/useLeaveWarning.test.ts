// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLeaveWarning } from './useLeaveWarning'

const leave = (): Event => {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e
}

describe('useLeaveWarning', () => {
    it('should ask before leaving only while active', () => {
        const { rerender, unmount } = renderHook(({ on }) => useLeaveWarning(on), { initialProps: { on: false } })
        expect(leave().defaultPrevented).toBe(false)
        rerender({ on: true })
        expect(leave().defaultPrevented).toBe(true)
        rerender({ on: false })
        expect(leave().defaultPrevented).toBe(false)
        rerender({ on: true })
        unmount()
        expect(leave().defaultPrevented).toBe(false)
    })
})
