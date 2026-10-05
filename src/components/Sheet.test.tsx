// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet } from './Sheet'

describe('Sheet', () => {
    it('should show a titled dialog and close on Escape, the close button and the backdrop', async () => {
        const onClose = vi.fn()
        render(<Sheet label="Advanced settings" onClose={onClose}><p>body</p></Sheet>)
        expect(screen.getByRole('dialog', { name: 'Advanced settings' })).toHaveTextContent('body')
        await userEvent.keyboard('{Escape}')
        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        await userEvent.click(document.querySelector('.sheet-backdrop')!)
        expect(onClose).toHaveBeenCalledTimes(3)
    })

    it('should not close when clicking inside', async () => {
        const onClose = vi.fn()
        render(<Sheet label="Files" onClose={onClose}><p>body</p></Sheet>)
        await userEvent.click(screen.getByText('body'))
        expect(onClose).not.toHaveBeenCalled()
    })
})
