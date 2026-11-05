// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { MatchEvent } from '../types'
import { defaultGoalAreas } from '../utils/crop'
import { NOTE_MAX } from '../utils/eventTypes'
import { EventSheet } from './EventSheet'

const useFrameAt = vi.hoisted(() => vi.fn())
vi.mock('./frameGrab', () => ({ useFrameAt }))
const READY = { status: 'ready', frame: { src: 'data:image/jpeg;base64,AA==', aspect: 16 / 9 } }
const file = { id: 'a', name: 'a.mp4', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' as const }
const teams = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }]
const ev = (): MatchEvent => useAppState.getState().events.find((e) => e.id === 'a')!

function setup(event: Partial<MatchEvent> = {}, view: 'details' | 'framing' = 'details'): void {
    useFrameAt.mockReset()
    useFrameAt.mockReturnValue(READY)
    useAppState.setState({
        files: [file], cumulativeOffsets: [0], teams, goalAreas: defaultGoalAreas(), lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
        events: [{ id: 'a', matchTimeSec: 95, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'Sam', marks: ['teaser'], ...event }],
        undoStack: [], redoStack: [], picker: null, panel: 'event', editingEventId: 'a', editingView: view, editingTarget: 'teaser',
    })
    render(<EventSheet />)
}

describe('TeaserSheet', () => {
    it('should be titled with the moment and its clock', () => {
        setup()
        expect(screen.getByRole('dialog', { name: 'Teaser: Goal · 01:35' })).toBeInTheDocument()
    })

    it('should set the caption (limited, with a counter), with the automatic line as the placeholder', async () => {
        setup()
        const caption = screen.getByRole('textbox', { name: 'Caption' })
        expect(caption).toHaveAttribute('placeholder', 'GOAL · SAM')
        expect(caption).toHaveAttribute('maxLength', String(NOTE_MAX))
        await userEvent.type(caption, 'Wait for it{Enter}')
        expect(ev().teaser?.caption).toBe('Wait for it')
        expect(ev().notes).toBeUndefined()
        await userEvent.clear(caption)
        await userEvent.tab()
        expect(ev().teaser).toBeUndefined()
    })

    it('should set seconds before and after (0 to 15), with the match values as placeholders', async () => {
        setup()
        const before = screen.getByRole('spinbutton', { name: 'Seconds before' })
        const after = screen.getByRole('spinbutton', { name: 'Seconds after' })
        expect(before).toHaveAttribute('placeholder', '10')
        expect(after).toHaveAttribute('placeholder', '4')
        expect(before).toHaveAttribute('min', '0'); expect(before).toHaveAttribute('max', '15')
        await userEvent.type(before, '6'); await userEvent.tab()
        await userEvent.type(after, '99'); await userEvent.tab()
        expect(ev().teaser).toEqual({ beforeSec: 6, afterSec: 15 })
        await userEvent.clear(before); await userEvent.tab()
        expect(ev().teaser).toEqual({ afterSec: 15 })
    })

    it('should switch the teaser\'s slow-mo replay', async () => {
        setup()
        const sw = screen.getByRole('switch', { name: 'Teaser slow-mo replay' })
        expect(sw).toHaveAttribute('aria-checked', 'false')
        await userEvent.click(sw)
        expect(ev().teaser?.replay).toBe(true)
        expect(ev().replay).toBeUndefined()
        expect(sw).toHaveAttribute('aria-checked', 'true')
    })

    it('should Reset to automatic: clear every teaser edit but keep the star', async () => {
        setup({ teaser: { caption: 'x', beforeSec: 3, afterSec: 2, replay: true, replayCrop: 'full' } })
        await userEvent.click(screen.getByRole('button', { name: 'Reset to automatic' }))
        expect(ev().teaser).toBeUndefined()
        expect(ev().marks).toEqual(['teaser'])
        expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveValue('')
        expect(screen.getByRole('button', { name: 'Reset to automatic' })).toBeDisabled()
    })

    it('should Unstar and close', async () => {
        setup({ teaser: { caption: 'x' } })
        await userEvent.click(screen.getByRole('button', { name: 'Unstar' }))
        expect(ev().marks).toBeUndefined()
        expect(ev().teaser).toBeUndefined()
        expect(useAppState.getState().panel).toBeNull()
    })

    it('should save a pending caption when Done closes the sheet', async () => {
        setup()
        await userEvent.type(screen.getByRole('textbox', { name: 'Caption' }), 'Late winner')
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(ev().teaser?.caption).toBe('Late winner')
        expect(useAppState.getState().panel).toBeNull()
    })
})

describe('Teaser framing', () => {
    it('should write only the teaser crop, leaving the event\'s own', async () => {
        setup({ replay: true, replayCrop: 'team1', teaser: { replay: true } }, 'framing')
        await userEvent.click(screen.getByRole('button', { name: 'Full frame' }))
        expect(ev().teaser?.replayCrop).toBe('full')
        expect(ev().replayCrop).toBe('team1')
        await userEvent.click(screen.getByRole('button', { name: 'Auto' }))
        expect(ev().teaser?.replayCrop).toBeUndefined()
        expect(ev().replayCrop).toBe('team1')
    })

    it('should show Auto while the teaser has no crop of its own', () => {
        setup({ replay: true, replayCrop: 'full', teaser: { replay: true } }, 'framing')
        expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('should appear only while the teaser replay is on', () => {
        setup({ teaser: { caption: 'x' } }, 'framing')
        expect(screen.queryByRole('group', { name: 'Replay framing' })).not.toBeInTheDocument()
    })
})
