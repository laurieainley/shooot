// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

const processVideoFiles = vi.fn()
vi.mock('../utils/processFiles', () => ({ processVideoFiles: (...a: unknown[]) => processVideoFiles(...a) }))

import { FilesSheet } from './FilesSheet'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const s = () => useAppState.getState()
const row = (name: string): HTMLElement => screen.getByRole('listitem', { name })

describe('FilesSheet', () => {
    const onClose = vi.fn()
    beforeEach(() => {
        onClose.mockReset()
        processVideoFiles.mockReset()
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], currentFileIndex: 0, opening: null, undoStack: [], redoStack: [], panel: 'files' })
        s().setFiles([vf('a.mp4'), vf('b.mp4')])
    })

    it('should list the files in timeline order and mark the playing one', () => {
        render(<FilesSheet onClose={onClose} />)
        expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['a.mp4', 'b.mp4'])
        expect(row('a.mp4')).toHaveAttribute('aria-current', 'true')
    })

    it('should number the slots in timeline order', () => {
        render(<FilesSheet onClose={onClose} />)
        expect(row('a.mp4').querySelector('.file-slot__num')?.textContent).toBe('1')
        expect(row('b.mp4').querySelector('.file-slot__num')?.textContent).toBe('2')
        expect(row('b.mp4').querySelector('.file-card__name')?.textContent).toBe('b.mp4')
    })

    it('should explain the order and show where each file starts', () => {
        render(<FilesSheet onClose={onClose} />)
        expect(screen.getByText(/arrange them in chronological order/i)).toBeInTheDocument()
        expect(row('b.mp4').textContent).toContain('Starts 10:00')
        expect(row('b.mp4').textContent).toContain('Duration 10:00')
        expect(screen.getByText(/check the thumbnails/i)).toBeInTheDocument()
    })

    it('should confirm filming order when recording times agree', () => {
        s().setFiles([{ ...vf('a.mp4'), recordedAtMs: 1000 }, { ...vf('b.mp4'), recordedAtMs: 2000 }])
        render(<FilesSheet onClose={onClose} />)
        expect(screen.getByText(/in filming order/i)).toBeInTheDocument()
    })

    it('should flag a file filmed earlier than the one above and sort on request', async () => {
        s().setFiles([{ ...vf('a.mp4'), recordedAtMs: 2000 }, { ...vf('b.mp4'), recordedAtMs: 1000 }])
        render(<FilesSheet onClose={onClose} />)
        expect(within(row('b.mp4')).getByText('filmed before 1')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Sort by filming time' }))
        expect(s().files.map((f) => f.name)).toEqual(['b.mp4', 'a.mp4'])
        expect(s().currentFileIndex).toBe(1)
    })

    it('should switch to a file on tap and close', async () => {
        render(<FilesSheet onClose={onClose} />)
        await userEvent.click(within(row('b.mp4')).getByRole('button', { name: /play b\.mp4/i }))
        expect(s().currentFileIndex).toBe(1)
        expect(onClose).toHaveBeenCalled()
    })

    it('should reorder with arrow keys on the grip and remove from the ⋯ menu without closing', async () => {
        render(<FilesSheet onClose={onClose} />)
        screen.getByRole('button', { name: 'Reorder b.mp4' }).focus()
        await userEvent.keyboard('{ArrowUp}')
        expect(s().files.map((f) => f.name)).toEqual(['b.mp4', 'a.mp4'])
        await userEvent.click(screen.getByRole('button', { name: 'More for a.mp4' }))
        await userEvent.click(screen.getByRole('button', { name: 'Remove a.mp4' }))
        expect(s().files.map((f) => f.name)).toEqual(['b.mp4'])
        expect(onClose).not.toHaveBeenCalled()
    })

    it('should show the filming time as a time of day', () => {
        const at = new Date(2026, 9, 11, 19, 1).getTime()
        s().setFiles([{ ...vf('a.mp4'), recordedAtMs: at }, { ...vf('b.mp4'), recordedAtMs: at + 3_600_000 }])
        render(<FilesSheet onClose={onClose} />)
        expect(row('a.mp4').textContent).toContain('Filmed 7:01pm')
        expect(row('b.mp4').textContent).toContain('Filmed 8:01pm')
    })

    it('should replace one entry with a newly picked file', async () => {
        processVideoFiles.mockResolvedValue({ files: [vf('c.mp4')], error: null })
        render(<FilesSheet onClose={onClose} />)
        const input = within(row('a.mp4')).getByLabelText('Replace a.mp4 with', { selector: 'input' })
        fireEvent.change(input, { target: { files: [new File([''], 'c.mp4')] } })
        await waitFor(() => expect(s().files.map((f) => f.name)).toEqual(['c.mp4', 'b.mp4']))
    })

    it('should show the opening progress and disable adding meanwhile', () => {
        useAppState.setState({ opening: 'Opening GX010226.MP4 (11.9 GB)…' })
        render(<FilesSheet onClose={onClose} />)
        expect(screen.getByRole('status')).toHaveTextContent('Opening GX010226.MP4 (11.9 GB)…')
        expect(screen.getByRole('button', { name: /add files/i })).toBeDisabled()
    })
})
