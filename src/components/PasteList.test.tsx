// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { PasteList } from './PasteList'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })

describe('PasteList', () => {
    beforeEach(() => {
        useAppState.setState({ files: [vf('a.mp4')], cumulativeOffsets: [0], events: [], currentFileIndex: 0, undoStack: [], redoStack: [], panel: 'paste' })
    })

    it('should add each parsed line as an event, undoably, and close', async () => {
        render(<PasteList />)
        fireEvent.change(screen.getByRole('textbox', { name: 'Paste list' }), { target: { value: '07:12 Whites - Sam\n23:41 Colours - Jo' } })
        await userEvent.click(screen.getByRole('button', { name: 'Add events' }))
        expect(useAppState.getState().events.map((e) => [e.matchTimeSec, e.team, e.scorer])).toEqual([[432, 'Whites', 'Sam'], [1421, 'Colours', 'Jo']])
        expect(useAppState.getState().panel).toBeNull()
        useAppState.getState().undo()
        expect(useAppState.getState().events).toHaveLength(0)
    })
})
