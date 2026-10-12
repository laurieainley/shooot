// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { vi } from 'vitest'
import { MatchSetup } from './MatchSetup'

vi.mock('./frameGrab', () => ({ useFrameAt: () => ({ status: 'idle', frame: null }), useStillAt: () => ({ status: 'idle', frame: null }) }))

const s = () => useAppState.getState()

describe('MatchSetup', () => {
    beforeEach(() => {
        useAppState.setState({
            teams: [{ name: 'Whites', color: '#f5f5f5', roster: [] }, { name: 'Colours', color: '#f72585', roster: [] }],
            events: [{ id: 'e', matchTimeSec: 1, sourceFileIndex: 0, type: 'goal', team: 'Whites' }],
            files: [], cumulativeOffsets: [], currentFileIndex: 0, currentTimeInFileSec: 75,
        })
    })

    it('should rename a team and update its events', async () => {
        render(<MatchSetup onClose={() => {}} />)
        const name = screen.getByLabelText('Team 1 name')
        await userEvent.clear(name)
        await userEvent.type(name, 'Lights')
        fireEvent.blur(name)
        expect(s().teams[0].name).toBe('Lights')
        expect(s().events[0].team).toBe('Lights')
    })

    it('should offer a multicolour swatch that stores \'multi\' and shows as stripes', async () => {
        render(<MatchSetup onClose={() => {}} />)
        const swatch = screen.getByRole('button', { name: 'Team 2 colour multicolour' })
        expect(swatch).toHaveAttribute('aria-pressed', 'false')
        await userEvent.click(swatch)
        expect(s().teams[1].color).toBe('multi')
        expect(screen.getByRole('button', { name: 'Team 2 colour multicolour' })).toHaveAttribute('aria-pressed', 'true')
        expect(swatch.style.background).toMatch(/linear-gradient/)
    })

    it('should not show the kick-off hint', () => {
        render(<MatchSetup onClose={() => {}} />)
        expect(screen.queryByText(/Kick off, Half time and Final whistle/i)).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Match start')).not.toBeInTheDocument()
    })

    it('should hide Goal areas until a video is loaded', () => {
        const { unmount } = render(<MatchSetup onClose={() => {}} />)
        expect(screen.queryByRole('region', { name: 'Goal areas' })).not.toBeInTheDocument()
        unmount()
        useAppState.setState({ files: [{ id: 'a', name: 'a.mp4', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 60, kind: 'full' }] })
        render(<MatchSetup onClose={() => {}} />)
        expect(screen.getByRole('region', { name: 'Goal areas' })).toBeInTheDocument()
    })

    it('should lead with Title and the teams', () => {
        render(<MatchSetup onClose={() => {}} />)
        const title = screen.getByLabelText('Title')
        expect(title.compareDocumentPosition(screen.getByLabelText('Team 1 name')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('should say that teams and rosters are remembered', () => {
        render(<MatchSetup onClose={() => {}} />)
        expect(screen.getByText('Teams and rosters are remembered for next time.')).toBeInTheDocument()
    })
})

describe('MatchSetup Done', () => {
    it('should close the sheet from the Done button', async () => {
        const onClose = vi.fn()
        render(<MatchSetup onClose={onClose} />)
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(onClose).toHaveBeenCalled()
    })
})
