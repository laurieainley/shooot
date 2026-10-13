// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnPanel } from './ColumnPanel'
import { usePanelSlot } from './panelSlot'
import { useFullscreenUi } from './fullscreenUi'
import { setCoarsePointer } from '../test/pointer'

describe('ColumnPanel', () => {
    afterEach(() => usePanelSlot.setState({ el: null }))

    it('should render into the slot in the rail instead of a modal over the picture', () => {
        const slot = document.createElement('div')
        document.body.appendChild(slot)
        act(() => usePanelSlot.setState({ el: slot }))
        render(<ColumnPanel label="Edit event" onClose={() => undefined}><p>fields</p></ColumnPanel>)
        const dialog = screen.getByRole('dialog', { name: 'Edit event' })
        expect(slot).toContainElement(dialog)
        expect(dialog).not.toHaveAttribute('aria-modal')
        expect(document.querySelector('.sheet-backdrop')).toBeNull()
        slot.remove()
    })

    it('should close from the × button and from Escape', async () => {
        const slot = document.createElement('div')
        document.body.appendChild(slot)
        act(() => usePanelSlot.setState({ el: slot }))
        const onClose = vi.fn()
        render(<ColumnPanel label="Edit event" onClose={onClose}>x</ColumnPanel>)
        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(onClose).toHaveBeenCalledTimes(1)
        await userEvent.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledTimes(2)
        slot.remove()
    })

    it('should fall back to a modal sheet when there is no slot', () => {
        render(<ColumnPanel label="Edit event" onClose={() => undefined}>x</ColumnPanel>)
        expect(screen.getByRole('dialog', { name: 'Edit event' })).toHaveAttribute('aria-modal', 'true')
    })

    describe('in fullscreen on touch', () => {
        afterEach(() => { useFullscreenUi.setState({ host: null, reviewHidden: false }); setCoarsePointer(false) })
        const setup = (): { slot: HTMLElement; host: HTMLElement } => {
            const slot = document.createElement('div'); const host = document.createElement('div')
            document.body.append(slot, host)
            act(() => { usePanelSlot.setState({ el: slot }); useFullscreenUi.setState({ host }) })
            return { slot, host }
        }
        it('should render inside the fullscreen element so it is visible, not in the rail', () => {
            setCoarsePointer(true)
            const { slot, host } = setup()
            render(<ColumnPanel label="Suggested goals" className="review" onClose={() => undefined}>x</ColumnPanel>)
            const dialog = screen.getByRole('dialog', { name: 'Suggested goals' })
            expect(host).toContainElement(dialog)
            expect(slot).not.toContainElement(dialog)
            expect(dialog.className).toContain('column-panel--fs')
            slot.remove(); host.remove()
        })
        it('should be tucked away (still mounted) while the review is hidden', () => {
            setCoarsePointer(true)
            const { slot, host } = setup()
            act(() => useFullscreenUi.setState({ reviewHidden: true }))
            render(<ColumnPanel label="Suggested goals" className="review" onClose={() => undefined}>x</ColumnPanel>)
            expect(screen.getByRole('dialog', { name: 'Suggested goals', hidden: true }).className).toContain('column-panel--fs-hidden')
            slot.remove(); host.remove()
        })
        it('should keep what is inside (state, typed text) when the player goes fullscreen and back', () => {
            setCoarsePointer(true)
            const slot = document.createElement('div'); const host = document.createElement('div')
            document.body.append(slot, host)
            act(() => { usePanelSlot.setState({ el: slot }); useFullscreenUi.setState({ host: null }) })
            render(<ColumnPanel label="Suggested goals" className="review" onClose={() => undefined}><input aria-label="field" /></ColumnPanel>)
            const input = screen.getByLabelText('field')
            expect(slot).toContainElement(input)
            act(() => useFullscreenUi.setState({ host }))
            expect(host).toContainElement(screen.getByLabelText('field'))
            expect(screen.getByLabelText('field')).toBe(input) // same node: not remounted
            act(() => useFullscreenUi.setState({ host: null }))
            expect(slot).toContainElement(input)
            slot.remove(); host.remove()
        })
        it('should stay in the rail with a mouse', () => {
            setCoarsePointer(false)
            const { slot, host } = setup()
            render(<ColumnPanel label="Suggested goals" className="review" onClose={() => undefined}>x</ColumnPanel>)
            expect(slot).toContainElement(screen.getByRole('dialog', { name: 'Suggested goals' }))
            slot.remove(); host.remove()
        })
    })
})
