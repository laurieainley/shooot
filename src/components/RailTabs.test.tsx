// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { railTabStore, setRailTab } from './railTab'
import { RailTabs } from './RailTabs'
import type { MatchEvent } from '../types'

describe('RailTabs', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [] })
        setRailTab('events')
    })

    it('should render Events and Matches tabs with the selected one marked', () => {
        useAppState.setState({ events: [{ id: 'a', type: 'goal', matchTimeSec: 1, sourceFileIndex: 0 } as MatchEvent] })
        render(<RailTabs />)
        expect(screen.getByRole('tablist')).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tab', { name: 'Matches' })).toHaveAttribute('aria-selected', 'false')
    })

    it('should switch tabs on click and with the arrow keys', async () => {
        useAppState.setState({ events: [{ id: 'a', type: 'goal', matchTimeSec: 1, sourceFileIndex: 0 } as MatchEvent] })
        render(<RailTabs />)
        await userEvent.click(screen.getByRole('tab', { name: 'Matches' }))
        expect(railTabStore.getState().tab).toBe('matches')
        screen.getByRole('tab', { name: 'Matches' }).focus()
        await userEvent.keyboard('{ArrowLeft}')
        expect(railTabStore.getState().tab).toBe('events')
        await userEvent.keyboard('{ArrowRight}')
        expect(railTabStore.getState().tab).toBe('matches')
    })

    it('should default to Matches when there are no files and no events', () => {
        render(<RailTabs />)
        expect(screen.getByRole('tab', { name: 'Matches' })).toHaveAttribute('aria-selected', 'true')
    })
})
