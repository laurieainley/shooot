// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { GoalList } from './GoalList'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100 })

describe('GoalList', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')],
            events: [
                { id: 'linked', matchTimeSec: 10, sourceFileIndex: 0, sourceFileKey: 'a.mp4', type: 'goal' },
                { id: 'orphan', matchTimeSec: 20, sourceFileIndex: 1, sourceFileKey: 'gone.mp4', unlinked: true, type: 'goal' },
            ],
        })
    })

    it('should tag unlinked events as file missing and disable their seek button', () => {
        render(<GoalList />)
        expect(screen.getByText('V1')).toBeInTheDocument()
        expect(screen.getByText(/file missing/i)).toBeInTheDocument()
        const watch = screen.getAllByTitle(/watch goal|file not loaded/i)
        expect(watch[1]).toBeDisabled()
    })
})
