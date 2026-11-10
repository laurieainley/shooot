// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const answerReplace = vi.fn()
const cancelPartsLoad = vi.fn()
const dismissPartsNotice = vi.fn()
vi.mock('../prepare/partsLoad', async (orig) => ({
    ...(await orig<typeof import('../prepare/partsLoad')>()),
    answerReplace: (r: boolean) => answerReplace(r), cancelPartsLoad: () => cancelPartsLoad(), dismissPartsNotice: () => dismissPartsNotice(),
}))

import { partsLoadStore } from '../prepare/partsLoad'
import { PartsLoadStatus } from './PartsLoadStatus'

describe('PartsLoadStatus', () => {
    beforeEach(() => { vi.clearAllMocks(); partsLoadStore.setState({ phase: 'idle' }) })

    it('should show nothing when idle', () => {
        const { container } = render(<PartsLoadStatus />)
        expect(container).toBeEmptyDOMElement()
    })

    it('should show the progress with a Cancel', async () => {
        partsLoadStore.setState({ phase: 'loading', device: 'Android phone', done: 25, total: 100 })
        render(<PartsLoadStatus />)
        expect(screen.getByRole('status')).toHaveTextContent('Loading prepared parts from Android phone… 25%')
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(cancelPartsLoad).toHaveBeenCalled()
    })

    it('should ask before replacing the open project', async () => {
        partsLoadStore.setState({ phase: 'confirm', device: 'iPad', incoming: 3, existing: 5 })
        render(<PartsLoadStatus />)
        const dialog = screen.getByRole('alertdialog', { name: 'Replace project' })
        expect(dialog).toHaveTextContent('Replace your 5 events with the 3 in this file from iPad?')
        expect(dialog).toHaveTextContent('The prepared parts load either way.')
        await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
        expect(answerReplace).toHaveBeenCalledWith(true)
        await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
        expect(answerReplace).toHaveBeenCalledWith(false)
    })

    it('should keep a note on screen until dismissed', async () => {
        partsLoadStore.setState({ phase: 'notice', text: '3 parts were damaged and will be encoded here.' })
        render(<PartsLoadStatus />)
        expect(screen.getByRole('alert')).toHaveTextContent('3 parts were damaged and will be encoded here.')
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
        expect(dismissPartsNotice).toHaveBeenCalled()
    })
})
