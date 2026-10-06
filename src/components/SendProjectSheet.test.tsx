// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'

vi.mock('qrcode', () => ({ default: { toString: vi.fn(async () => '<svg data-testid="qr"></svg>') } }))
import { SendProjectSheet } from './SendProjectSheet'

describe('SendProjectSheet', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [{ id: 'a', type: 'goal', matchTimeSec: 10, sourceFileIndex: 0, sourceFileKey: 'k', team: 'Whites' }] })
    })
    afterEach(() => { vi.unstubAllGlobals() })

    it('should show a QR code, the link, its size and Copy link', async () => {
        render(<SendProjectSheet onClose={() => undefined} />)
        expect(await screen.findByLabelText('QR code of the project link')).toBeInTheDocument()
        const link = screen.getByLabelText('Project link') as HTMLInputElement
        expect(link.value).toMatch(/\/#p=z1\./)
        expect(screen.getByText(/characters/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    })

    it('should copy the link to the clipboard', async () => {
        const writeText = vi.fn(async () => undefined)
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
        render(<SendProjectSheet onClose={() => undefined} />)
        await userEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#p=z1.'))
        expect(await screen.findByText('Link copied')).toBeInTheDocument()
    })

    it('should offer Share… only where the browser can share, and share the link', async () => {
        const { unmount } = render(<SendProjectSheet onClose={() => undefined} />)
        await screen.findByLabelText('Project link')
        expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument()
        unmount()
        const share = vi.fn(async () => undefined)
        vi.stubGlobal('navigator', { ...navigator, share })
        render(<SendProjectSheet onClose={() => undefined} />)
        await userEvent.click(await screen.findByRole('button', { name: 'Share…' }))
        expect(share).toHaveBeenCalledWith({ url: expect.stringContaining('#p=z1.') })
    })

    it('should say Share and Copy are more reliable when the link is too long for a QR code', async () => {
        const roster = Array.from({ length: 400 }, (_, i) => `P${i}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`)
        useAppState.setState({ teams: [{ name: 'A', color: '#fff', roster }, { name: 'B', color: '#000', roster: [] }] })
        render(<SendProjectSheet onClose={() => undefined} />)
        expect(await screen.findByText(/Share or Copy is more reliable/)).toBeInTheDocument()
    })
})
