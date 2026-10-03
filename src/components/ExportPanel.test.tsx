// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

vi.mock('../render', () => ({ renderReel: vi.fn() }))

import { ExportPanel } from './ExportPanel'

const proxy: VideoSourceFile = { id: 'p', name: 'GL010226.LRV', kind: 'proxy', url: '', file: new File([''], 'GL010226.LRV'), durationSec: 600 }

describe('ExportPanel', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [proxy], cumulativeOffsets: [0], isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0,
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }],
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
        })
    })

    it('should be closed until the Export button is pressed', () => {
        render(<ExportPanel />)
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
    })

    it('should show preview, render, chapters and project sections when opened', async () => {
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        const dialog = screen.getByRole('dialog', { name: 'Export' })
        expect(dialog).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /preview in player/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /preview reel/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /full quality/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /copy youtube chapters/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /export project/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /import project/i })).toBeInTheDocument()
    })

    it('should start the in-player preview and close itself', async () => {
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        await userEvent.click(screen.getByRole('button', { name: /preview in player/i }))
        expect(useAppState.getState().isPreviewMode).toBe(true)
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
    })

    it('should close on Escape', async () => {
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
    })
})
