// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { ReelSummary } from './ReelSummary'
import type { VideoSourceFile } from '../types'

const vf: VideoSourceFile = { id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' }

describe('ReelSummary', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf], cumulativeOffsets: [0],
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 3, replayAfterSec: 1, replaySpeed: 0.5,
            events: [
                { id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' },
                { id: 'b', matchTimeSec: 300, sourceFileIndex: 0, type: 'highlight' },
            ],
        })
    })

    it('should show the reel length with the clip count', () => {
        render(<ReelSummary />)
        // 14 + 8 (replay) + 14 = 36 s
        expect(screen.getByLabelText('Reel summary')).toHaveTextContent('0:36 reel · 2 clips')
    })

    it('should use the singular for one clip', () => {
        useAppState.setState({ events: [{ id: 'h', matchTimeSec: 100, sourceFileIndex: 0, type: 'highlight' }] })
        render(<ReelSummary />)
        expect(screen.getByLabelText('Reel summary')).toHaveTextContent('0:14 reel · 1 clip')
    })

    it('should not carry the clip settings (they live in the Export drawer\'s Clips & replays row)', () => {
        render(<ReelSummary />)
        expect(screen.queryByText(/Clips: 10 s before/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    })

    describe('known final score note', () => {
        const goals = (n: number, team: string) => Array.from({ length: n }, (_, i) => ({ id: `${team}${i}`, matchTimeSec: 10 + i, sourceFileIndex: 0, type: 'goal' as const, team }))
        beforeEach(() => useAppState.setState({ teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }], knownFinalScore: null }))
        it('should say what was tagged against the final score when they differ', () => {
            useAppState.setState({ events: [...goals(11, 'Whites'), ...goals(8, 'Colours')], knownFinalScore: [13, 9] })
            render(<ReelSummary />)
            expect(screen.getByText('Tagged 11–8, final score 13–9.')).toBeInTheDocument()
        })
        it('should stay quiet when they match or there is no known score', () => {
            useAppState.setState({ events: [...goals(13, 'Whites'), ...goals(9, 'Colours')], knownFinalScore: [13, 9] })
            const { rerender } = render(<ReelSummary />)
            expect(screen.queryByText(/final score/)).toBeNull()
            useAppState.setState({ knownFinalScore: null })
            rerender(<ReelSummary />)
            expect(screen.queryByText(/final score/)).toBeNull()
        })
    })
})

describe('ReelSummary update link', () => {
    it('should offer Update to the raised score when tagged goals exceed the final score', () => {
        const g = (id: string, team: string) => ({ id, matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' as const, team })
        useAppState.setState({ files: [vf], cumulativeOffsets: [0], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }], events: [g('a', 'Whites'), g('b', 'Whites')], knownFinalScore: [1, 1] })
        render(<ReelSummary />)
        screen.getByRole('button', { name: 'Update to 2–1' }).click()
        expect(useAppState.getState().knownFinalScore).toEqual([2, 1])
    })
    it('should not offer it when only goals are missing', () => {
        useAppState.setState({ files: [vf], cumulativeOffsets: [0], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }], events: [], knownFinalScore: [1, 1] })
        render(<ReelSummary />)
        expect(screen.queryByRole('button', { name: /Update to/ })).toBeNull()
    })
})
