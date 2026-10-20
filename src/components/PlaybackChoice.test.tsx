// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { renderJobs } from '../renderJobs'
import type { VideoSourceFile } from '../types'
import { PlaybackChoice, PLAYBACK_HINT } from './PlaybackChoice'
import { currentPlaybackPref, choosePlayback, mp4FailedToPlay, MP4_FALLBACK_TOAST } from './playbackPref'
import { toastStore } from '../toasts'

const mk = (name: string, w: number) => ({ file: new File([''], name), name, width: w })
const paired = (): VideoSourceFile => {
    const full = mk('GX010042.MP4', 1920), proxy = mk('GL010042.LRV', 854)
    return { id: 'p', file: proxy.file, url: 'blob:lrv', name: proxy.name, kind: 'proxy', durationSec: 20, width: 854, fullFile: full.file, pair: { full, proxy } }
}
const plain: VideoSourceFile = { id: 'u', file: new File([''], 'a.mp4'), url: 'blob:a', name: 'a.mp4', kind: 'full', durationSec: 10 }
const s = () => useAppState.getState()

describe('PlaybackChoice', () => {
    beforeEach(() => {
        localStorage.clear()
        toastStore.setState({ toast: null })
        vi.spyOn(URL, 'createObjectURL').mockImplementation((f) => `blob:${(f as File).name}`)
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
        useAppState.setState({ files: [paired()], cumulativeOffsets: [0], currentFileIndex: 0, panel: null })
        choosePlayback('lrv')
    })

    it('should show only when a file has both its MP4 and LRV', () => {
        useAppState.setState({ files: [plain] })
        const { container } = render(<PlaybackChoice variant="menu" />)
        expect(container).toBeEmptyDOMElement()
    })

    it('should switch the playing source and remember the choice on this device', async () => {
        render(<PlaybackChoice variant="menu" />)
        expect(screen.getByRole('button', { name: 'LRV' })).toHaveAttribute('aria-pressed', 'true')
        await userEvent.click(screen.getByRole('button', { name: 'MP4' }))
        expect(s().files[0]).toMatchObject({ name: 'GX010042.MP4', kind: 'full', width: 1920 })
        expect(screen.getByRole('button', { name: 'MP4' })).toHaveAttribute('aria-pressed', 'true')
        expect(localStorage.getItem('shooot-playback')).toBe('mp4')
        expect(currentPlaybackPref()).toBe('mp4')
    })

    it('should show the hint in the Files sheet row', () => {
        render(<PlaybackChoice variant="sheet" />)
        expect(screen.getByText(PLAYBACK_HINT)).toBeInTheDocument()
    })

    it('should be off, with a reason, while an export runs', async () => {
        const store = renderJobs()
        store.setState({ job: { phase: 'running' } as never })
        render(<PlaybackChoice variant="menu" />)
        expect(screen.getByRole('button', { name: 'MP4' })).toBeDisabled()
        expect(screen.getByRole('status')).toHaveTextContent('Not while exporting.')
        expect(choosePlayback('mp4')).toBe(false)
        expect(s().files[0].kind).toBe('proxy')
        store.setState({ job: null })
    })

    it('should say so and play the LRV when the MP4 fails to play', () => {
        choosePlayback('mp4')
        mp4FailedToPlay(0)
        expect(s().files[0].kind).toBe('proxy')
        expect(toastStore.getState().toast?.text).toBe(MP4_FALLBACK_TOAST)
    })
})
