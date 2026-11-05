// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { StarMenu } from './StarMenu'
import type { MatchEvent } from '../types'

const goal: MatchEvent = { id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }
const starred = (): boolean => !!useAppState.getState().events.find((e) => e.id === 'a')?.marks?.includes('teaser')

describe('StarMenu', () => {
    beforeEach(() => {
        useAppState.setState({ events: [goal], undoStack: [], redoStack: [] })
    })

    it('should be a labelled menu button that is closed until pressed', () => {
        render(<StarMenu event={goal} />)
        const btn = screen.getByRole('button', { name: 'Star' })
        expect(btn).toHaveAttribute('aria-haspopup', 'menu')
        expect(btn).toHaveAttribute('aria-expanded', 'false')
        expect(btn).toHaveTextContent('Star')
        expect(screen.queryByRole('menu')).toBeNull()
    })

    it('should open a menu with one checkbox item, "Teaser (top of video)", unchecked at first', async () => {
        render(<StarMenu event={goal} />)
        await userEvent.click(screen.getByRole('button', { name: 'Star' }))
        const item = screen.getByRole('menuitemcheckbox', { name: 'Teaser (top of video)' })
        expect(item).toHaveAttribute('aria-checked', 'false')
        expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(1)
    })

    it('should toggle the star and stay open', async () => {
        const { rerender } = render(<StarMenu event={goal} />)
        await userEvent.click(screen.getByRole('button', { name: 'Star' }))
        await userEvent.click(screen.getByRole('menuitemcheckbox'))
        expect(starred()).toBe(true)
        rerender(<StarMenu event={useAppState.getState().events[0]} />)
        expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'true')
        await userEvent.click(screen.getByRole('menuitemcheckbox'))
        expect(starred()).toBe(false)
        expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('should make the toggle one undo step', async () => {
        render(<StarMenu event={goal} />)
        await userEvent.click(screen.getByRole('button', { name: 'Star' }))
        await userEvent.click(screen.getByRole('menuitemcheckbox'))
        useAppState.getState().undo()
        expect(starred()).toBe(false)
    })

    it('should focus the item, close on Esc and return focus to the Star button', async () => {
        render(<StarMenu event={goal} />)
        const btn = screen.getByRole('button', { name: 'Star' })
        await userEvent.click(btn)
        expect(screen.getByRole('menuitemcheckbox')).toHaveFocus()
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('menu')).toBeNull()
        expect(btn).toHaveFocus()
    })

    it('should open from outside when told to (the S key)', () => {
        render(<StarMenu event={goal} open onOpenChange={() => undefined} />)
        expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('should place the menu above when opened by the S key near the bottom of the screen', () => {
        const rect = { top: 700, bottom: 740, height: 40, left: 0, right: 40, width: 40, x: 0, y: 700, toJSON: () => ({}) }
        const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect)
        const h = window.innerHeight
        Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
        try {
            const { rerender } = render(<StarMenu event={goal} open={false} onOpenChange={() => undefined} />)
            rerender(<StarMenu event={goal} open onOpenChange={() => undefined} />)
            const panel = screen.getByRole('dialog')
            expect(panel.style.bottom).not.toBe('')
            expect(panel.style.top).toBe('')
        } finally {
            spy.mockRestore()
            Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
        }
    })
})
