// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { MatchEvent, VideoSourceFile } from '../types'

const store = { handles: [] as { name: string }[], supported: true }
const reopenHandles = vi.fn(async (hs: { name: string }[]) => ({ files: hs.map((h) => new File(['x'], h.name)), failed: [] as string[] }))
vi.mock('../files/handleStore', () => ({
    filePicker: () => (store.supported ? vi.fn() : null),
    loadHandles: vi.fn(async () => store.handles),
    reopenHandles: (hs: { name: string }[]) => reopenHandles(hs),
}))
const addPickedFiles = vi.fn<(f: File[]) => Promise<string | null>>(async () => null)
vi.mock('./addFiles', () => ({ addPickedFiles: (f: File[]) => addPickedFiles(f) }))

import { RelinkBanner } from './RelinkBanner'

const ev = (id: string, key: string, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, type: 'goal', matchTimeSec: 10, sourceFileIndex: 0, sourceFileKey: key, ...extra })
const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 90, kind: 'full' })

describe('RelinkBanner', () => {
    beforeEach(() => {
        store.handles = []
        store.supported = true
        reopenHandles.mockClear()
        addPickedFiles.mockClear()
        useAppState.setState({ files: [], events: [ev('a', '010001'), ev('b', '020001'), ev('k', '010001', { type: 'kick_off' })] })
    })

    it('should stay hidden when every event has its video', () => {
        useAppState.setState({ events: [] })
        const { container } = render(<RelinkBanner />)
        expect(container).toBeEmptyDOMElement()
    })

    it('should reopen remembered files in one click where the browser keeps file handles', async () => {
        store.handles = [{ name: 'GX010001.MP4' }, { name: 'GX020001.MP4' }]
        render(<RelinkBanner />)
        expect(await screen.findByText(/3 events need their videos/i)).toBeInTheDocument()
        expect(screen.getByText(/one click/i)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Relink files' }))
        expect(reopenHandles).toHaveBeenCalled()
        await waitFor(() => expect(addPickedFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'GX010001.MP4' }), expect.objectContaining({ name: 'GX020001.MP4' })]))
    })

    it('should open the normal picker elsewhere, matching files by name', async () => {
        store.supported = false
        const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
        render(<RelinkBanner />)
        await userEvent.click(await screen.findByRole('button', { name: 'Relink files' }))
        expect(click).toHaveBeenCalled()
        expect(reopenHandles).not.toHaveBeenCalled()
        expect(screen.getByText(/pick the same videos/i)).toBeInTheDocument()
        click.mockRestore()
        const input = screen.getByLabelText('Videos to relink') as HTMLInputElement
        await userEvent.upload(input, [new File(['x'], 'GX010001.MP4'), new File(['x'], 'GX020001.MP4')])
        expect(addPickedFiles).toHaveBeenCalled()
    })

    it('should count only events whose file is missing when some videos are loaded', async () => {
        useAppState.setState({ files: [vf('GX010001.MP4')], events: [ev('a', '010001'), ev('b', '020001', { unlinked: true })] })
        render(<RelinkBanner />)
        expect(await screen.findByText(/1 event needs its video/i)).toBeInTheDocument()
        expect(screen.getByText(/020001/)).toBeInTheDocument()
    })
})
