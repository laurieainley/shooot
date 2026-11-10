// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreparePill } from './PreparePill'
import { appPreparer } from '../prepare/wire'
import type { PrepareStatus } from '../prepare/preparer'

const show = (status: PrepareStatus): void => { act(() => { appPreparer().store.setState({ status }) }) }

describe('PreparePill', () => {
    afterEach(() => { cleanup(); show({ kind: 'hidden' }) })

    it('should show nothing when there is nothing to prepare', () => {
        const { container } = render(<PreparePill />)
        expect(container).toBeEmptyDOMElement()
    })
    it('should show the kind and the percentage with a pause button while preparing', async () => {
        show({ kind: 'preparing', what: 'full match', percent: 34 })
        render(<PreparePill />)
        expect(screen.getByRole('button', { name: /Preparing full match · 34%/ })).toBeInTheDocument()
        const pause = vi.spyOn(appPreparer(), 'setPaused').mockImplementation(() => undefined)
        await userEvent.click(screen.getByRole('button', { name: 'Pause preparing' }))
        expect(pause).toHaveBeenCalledWith(true)
        pause.mockRestore()
    })
    it('should offer resume when paused by the user, and nothing to press when paused for an export', async () => {
        show({ kind: 'paused', byUser: true })
        const { unmount } = render(<PreparePill />)
        expect(screen.getByRole('button', { name: /Paused/ })).toBeInTheDocument()
        const resume = vi.spyOn(appPreparer(), 'setPaused').mockImplementation(() => undefined)
        await userEvent.click(screen.getByRole('button', { name: 'Resume preparing' }))
        expect(resume).toHaveBeenCalledWith(false)
        resume.mockRestore()
        unmount()
        show({ kind: 'paused', byUser: false })
        render(<PreparePill />)
        expect(screen.queryByRole('button', { name: 'Resume preparing' })).not.toBeInTheDocument()
        expect(screen.getByText('Paused while exporting')).toBeInTheDocument()
    })
    it('should show the full explanation on tap, for a warning as for Ready', async () => {
        const text = 'Not enough space to prepare the full match at 4K. Needs 14.2 GB, 6.1 GB available — free about 8.1 GB on this device to enable it.'
        show({ kind: 'nospace', text })
        render(<PreparePill />)
        const pill = screen.getByRole('button', { name: /Not enough space/ })
        expect(pill).toHaveAttribute('aria-expanded', 'false')
        await userEvent.click(pill)
        expect(pill).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('tooltip')).toHaveTextContent(text)
        expect(pill.closest('.prep-pill')).toHaveAttribute('data-open')
        await userEvent.keyboard('{Escape}')
        expect(pill).toHaveAttribute('aria-expanded', 'false')
        show({ kind: 'ready', text: 'Full match 4K and highlights 4K are ready; the export will only redo what you change.' })
        expect(screen.getByRole('button', { name: /Ready/ })).toBeInTheDocument()
        expect(screen.getByRole('tooltip')).toHaveTextContent('the export will only redo what you change')
    })

    describe('on a touch screen', () => {
        const media = (coarse: boolean): void => { vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse') ? coarse : false, addEventListener: () => undefined, removeEventListener: () => undefined })) }
        afterEach(() => { vi.unstubAllGlobals() })

        it('should say to keep the screen on while preparing, and name what is prepared when ready', async () => {
            media(true)
            show({ kind: 'preparing', what: 'full match', percent: 34 })
            const { unmount } = render(<PreparePill />)
            expect(screen.getByRole('tooltip')).toHaveTextContent('Keep the screen on — it stops if the phone locks.')
            unmount()
            show({ kind: 'ready', what: 'full match', text: 'Full match 4K is ready; the export will only redo what you change.' })
            render(<PreparePill />)
            expect(screen.getByRole('button', { name: 'Full match prepared ✓' })).toBeInTheDocument()
        })
    })
})
