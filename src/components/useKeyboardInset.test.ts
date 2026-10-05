// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardInset } from './useKeyboardInset'

class FakeViewport extends EventTarget { height = 844; offsetTop = 0 }

describe('useKeyboardInset', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    afterEach(() => {
        if (original) Object.defineProperty(window, 'visualViewport', original)
        document.documentElement.style.removeProperty('--kb')
    })

    it('should publish the keyboard height as --kb on the root while the visual viewport shrinks', () => {
        const vv = new FakeViewport()
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
        const { unmount } = renderHook(() => useKeyboardInset())
        expect(document.documentElement.style.getPropertyValue('--kb')).toBe('0px')
        act(() => { vv.height = 508; vv.dispatchEvent(new Event('resize')) })
        expect(document.documentElement.style.getPropertyValue('--kb')).toBe('336px')
        expect(document.documentElement).toHaveClass('kb-open')
        act(() => { vv.height = 844; vv.dispatchEvent(new Event('resize')) })
        expect(document.documentElement.style.getPropertyValue('--kb')).toBe('0px')
        expect(document.documentElement).not.toHaveClass('kb-open')
        unmount()
        expect(document.documentElement.style.getPropertyValue('--kb')).toBe('')
    })

    it('should do nothing without a visualViewport', () => {
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
        renderHook(() => useKeyboardInset())
        expect(document.documentElement.style.getPropertyValue('--kb')).toBe('')
    })
})
