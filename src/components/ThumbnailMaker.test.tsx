// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

const grab = vi.fn(async () => { throw new Error('no video in tests') })
vi.mock('./frameGrab', () => ({ grabFrame: (...a: unknown[]) => (grab as (...x: unknown[]) => Promise<unknown>)(...a) }))
vi.mock('../graphics/assets', () => ({ ensureGraphicsFonts: vi.fn(async () => true), loadLogo: vi.fn(async () => null) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))

import { ThumbnailMaker } from './ThumbnailMaker'

const file: VideoSourceFile = { id: 'f', name: 'a.mp4', kind: 'full', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 1000 }

describe('ThumbnailMaker', () => {
    beforeEach(() => {
        URL.createObjectURL = vi.fn(() => 'blob:x')
        URL.revokeObjectURL = vi.fn()
        useAppState.setState({
            files: [file], cumulativeOffsets: [0], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f0f', roster: [] }],
            events: [
                { id: 'g1', type: 'goal', matchTimeSec: 100, sourceFileIndex: 0, scorer: 'Sam' },
                { id: 'g2', type: 'goal', matchTimeSec: 400, sourceFileIndex: 0 },
            ],
        })
    })

    it('should ask to load videos first when there are none', () => {
        useAppState.setState({ files: [] })
        render(<ThumbnailMaker kind="highlights" />)
        expect(screen.getByText(/load the match videos/i)).toBeInTheDocument()
    })

    it('should flip between goals with the buttons and the arrow keys, and fine-tune the frame', async () => {
        render(<ThumbnailMaker kind="highlights" />)
        await userEvent.click(screen.getByRole('button', { name: /make a thumbnail/i }))
        expect(screen.getByText(/1 of 2 · Goal · 2' Sam/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Next moment' }))
        expect(screen.getByText(/2 of 2 · Goal/)).toBeInTheDocument()
        fireEvent.keyDown(screen.getByRole('group', { name: 'Choose the frame' }), { key: 'ArrowLeft' })
        expect(screen.getByText(/1 of 2 · Goal/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /later by a quarter second/i }))
        expect(screen.getByText('+0.25 s', { selector: 'span' })).toBeInTheDocument()
        expect(grab).toHaveBeenLastCalledWith('blob:a', expect.closeTo(100, 5), 1920)
    })

    it('should disable the zoom without goal areas', async () => {
        render(<ThumbnailMaker kind="fullMatch" />)
        await userEvent.click(screen.getByRole('button', { name: /make a thumbnail/i }))
        expect(screen.getByRole('checkbox', { name: /zoom to the goal/i })).toBeDisabled()
    })

    it('should offer the zoom for a highlight when goal areas exist, and reset a pan', async () => {
        useAppState.setState({
            events: [{ id: 'h1', type: 'highlight', matchTimeSec: 100, sourceFileIndex: 0, scorer: 'Thom' }],
            goalAreas: { team2: { x: 0.6, y: 0.2, w: 0.3, h: 0.4 } },
        })
        render(<ThumbnailMaker kind="highlights" />)
        await userEvent.click(screen.getByRole('button', { name: /make a thumbnail/i }))
        expect(screen.getByText(/1 of 1 · Highlight · 2' Thom/)).toBeInTheDocument()
        const box = screen.getByRole('checkbox', { name: /zoom to the goal/i })
        expect(box).toBeEnabled()
        expect(screen.getByText(/drag the picture to adjust/i)).toBeInTheDocument()
        await userEvent.click(box)
        expect(screen.queryByRole('button', { name: /reset position/i })).toBeNull()
    })

    it('should show the team line read-only, then let custom text replace it', async () => {
        render(<ThumbnailMaker kind="highlights" />)
        await userEvent.click(screen.getByRole('button', { name: /make a thumbnail/i }))
        const box = screen.getByRole('textbox', { name: /thumbnail text/i })
        expect(box).toHaveValue('Whites v Colours')
        expect(box).toBeDisabled()
        await userEvent.click(screen.getByRole('checkbox', { name: /custom text/i }))
        expect(box).toBeEnabled()
        expect(box).toHaveValue('Whites v Colours')
        await userEvent.clear(box)
        await userEvent.type(box, 'Cup final')
        expect(box).toHaveValue('Cup final')
        await userEvent.click(screen.getByRole('checkbox', { name: /custom text/i }))
        expect(box).toHaveValue('Whites v Colours')
    })
})
