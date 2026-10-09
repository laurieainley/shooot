// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { FilesButton } from './FilesButton'
import type { VideoSourceFile } from '../types'

const vf = (name: string, extra: Partial<VideoSourceFile> = {}): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full', ...extra })

describe('FilesButton', () => {
    beforeEach(() => { useAppState.setState({ files: [vf('GX010278.MP4'), vf('GX020278.MP4')], panel: null }) })

    it('should show the count and total duration, not the file names', () => {
        render(<FilesButton />)
        const btn = screen.getByRole('button', { name: /^Files: 2 files · 20:00/ })
        expect(btn).toHaveTextContent('2 files · 20:00')
        expect(btn).not.toHaveTextContent('GX010278')
    })

    it('should show only the count when compact (phone)', () => {
        render(<FilesButton compact />)
        expect(screen.getByRole('button', { name: /^Files/ })).toHaveTextContent(/^2$/)
    })

    it('should open the Files sheet', async () => {
        render(<FilesButton />)
        await userEvent.click(screen.getByRole('button', { name: /^Files/ }))
        expect(useAppState.getState().panel).toBe('files')
    })

    it('should show a warning dot (and say why) when a file cannot play here, and none otherwise', () => {
        const { container, rerender } = render(<FilesButton />)
        expect(container.querySelector('.files-btn__dot')).toBeNull()
        useAppState.setState({ files: [vf('a.MP4', { playbackIssue: 'HEVC' })] })
        rerender(<FilesButton />)
        expect(container.querySelector('.files-btn__dot')).not.toBeNull()
        expect(screen.getByRole('button', { name: /can't play here/ })).toBeInTheDocument()
    })
})
