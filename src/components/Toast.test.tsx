// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, showToast, TOAST_MS } from '../toasts'
import { Toast } from './Toast'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { act(() => { dismissToast() }); vi.useRealTimers() })

describe('Toast', () => {
    it('should render nothing until a toast is shown, as a polite status', () => {
        render(<Toast />)
        expect(screen.getByRole('status').textContent).toBe('')
        act(() => { showToast('Goal tagged at 12:34') })
        const s = screen.getByRole('status')
        expect(s.textContent).toContain('Goal tagged at 12:34')
        expect(s.getAttribute('aria-live')).toBe('polite')
    })
    it('should show one at a time: a new toast replaces the current one', () => {
        render(<Toast />)
        act(() => { showToast('First') })
        act(() => { showToast('Second') })
        expect(screen.queryByText('First')).toBeNull()
        expect(screen.getByText('Second')).toBeTruthy()
    })
    it('should dismiss after 4 s', () => {
        render(<Toast />)
        act(() => { showToast('Hello') })
        act(() => { vi.advanceTimersByTime(TOAST_MS - 100) })
        expect(screen.getByText('Hello')).toBeTruthy()
        act(() => { vi.advanceTimersByTime(200) })
        expect(screen.queryByText('Hello')).toBeNull()
    })
    it('should pause while hovered or focused', () => {
        render(<Toast />)
        act(() => { showToast('Hello', { label: 'Undo', run: () => {} }) })
        const s = screen.getByRole('status')
        fireEvent.mouseEnter(s)
        act(() => { vi.advanceTimersByTime(TOAST_MS * 2) })
        expect(screen.getByText('Hello')).toBeTruthy()
        fireEvent.mouseLeave(s)
        act(() => { vi.advanceTimersByTime(TOAST_MS + 10) })
        expect(screen.queryByText('Hello')).toBeNull()
        act(() => { showToast('Again', { label: 'Undo', run: () => {} }) })
        fireEvent.focus(screen.getByRole('button', { name: 'Undo' }))
        act(() => { vi.advanceTimersByTime(TOAST_MS * 2) })
        expect(screen.getByText('Again')).toBeTruthy()
    })
    it('should run the Undo action once and close', () => {
        const run = vi.fn()
        render(<Toast />)
        act(() => { showToast('Discarded 12:34', { label: 'Undo', run }) })
        const b = screen.getByRole('button', { name: 'Undo' })
        expect(b.className).toContain('toast__action')
        fireEvent.click(b)
        expect(run).toHaveBeenCalledTimes(1)
        expect(screen.queryByText('Discarded 12:34')).toBeNull()
    })
})

describe('Toast secondary action', () => {
    it('should render a second link that runs and dismisses', () => {
        const run = vi.fn()
        render(<Toast />)
        act(() => { showToast('Goal tagged', { label: 'Undo', run: () => {} }, { label: 'Add note', run }) })
        fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
        expect(run).toHaveBeenCalledTimes(1)
        expect(screen.queryByText('Goal tagged')).toBeNull()
    })
})
