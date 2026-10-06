// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnPanel } from './ColumnPanel'
import { usePanelSlot } from './panelSlot'

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
})
