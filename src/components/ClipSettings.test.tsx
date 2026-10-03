// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { ClipSettings } from './ClipSettings'

describe('ClipSettings', () => {
    beforeEach(() => {
        useAppState.setState({ replayBeforeSec: 3, replayAfterSec: 1, replaySpeed: 0.5 })
    })

    it('should update the replay window from the Replay before / after inputs', () => {
        render(<ClipSettings />)
        fireEvent.change(screen.getByLabelText('Replay before'), { target: { value: '5' } })
        fireEvent.change(screen.getByLabelText('Replay after'), { target: { value: '2' } })
        const s = useAppState.getState()
        expect([s.replayBeforeSec, s.replayAfterSec]).toEqual([5, 2])
    })

    it('should update the replay speed from the Replay speed select', async () => {
        render(<ClipSettings />)
        await userEvent.selectOptions(screen.getByLabelText('Replay speed'), '0.25')
        expect(useAppState.getState().replaySpeed).toBe(0.25)
    })
})
