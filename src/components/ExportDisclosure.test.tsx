// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDisclosure } from './ExportDisclosure'

describe('ExportDisclosure', () => {
    beforeEach(() => localStorage.clear())

    it('should be closed by default, with the title, a one-line summary and aria-expanded', () => {
        render(<ExportDisclosure id="clips" title="Clips & replays" summary="10 s before"><p>inside</p></ExportDisclosure>)
        const btn = screen.getByRole('button', { name: /Clips & replays/ })
        expect(btn).toHaveAttribute('aria-expanded', 'false')
        expect(btn).toHaveTextContent('10 s before')
        expect(screen.queryByText('inside')).not.toBeInTheDocument()
    })

    it('should open and close on press and remember the state', async () => {
        const { unmount } = render(<ExportDisclosure id="clips" title="Clips" summary="s"><p>inside</p></ExportDisclosure>)
        await userEvent.click(screen.getByRole('button', { name: /Clips/ }))
        expect(screen.getByText('inside')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Clips/ })).toHaveAttribute('aria-expanded', 'true')
        unmount()
        render(<ExportDisclosure id="clips" title="Clips" summary="s"><p>inside</p></ExportDisclosure>)
        expect(screen.getByText('inside')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /Clips/ }))
        expect(screen.queryByText('inside')).not.toBeInTheDocument()
    })

    it('should work when storage is unavailable', async () => {
        const orig = Storage.prototype.getItem
        Storage.prototype.getItem = () => { throw new Error('denied') }
        try {
            render(<ExportDisclosure id="x" title="X" summary="s"><p>inside</p></ExportDisclosure>)
            await userEvent.click(screen.getByRole('button', { name: /X/ }))
            expect(screen.getByText('inside')).toBeInTheDocument()
        } finally { Storage.prototype.getItem = orig }
    })
})
