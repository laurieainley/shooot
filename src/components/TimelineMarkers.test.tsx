// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useAppState } from '../state'
import { TimelineMarkers } from './TimelineMarkers'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 200 })

describe('TimelineMarkers', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], cumulativeOffsets: [0], currentFileIndex: 0, matchStartTimeSec: 20, lengthBeforeGoalSec: 10,
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', team: 'Whites' }],
        })
    })

    it('should render the start flag and event markers into the host', () => {
        const host = document.createElement('div')
        render(<TimelineMarkers host={host} durationSec={200} />)
        const markers = host.querySelectorAll('.timeline-marker')
        expect(markers).toHaveLength(2)
        expect((markers[1] as HTMLElement).style.left).toBe('50%')
    })

    it('should seek to the clip start on click', () => {
        const seek = vi.spyOn(useAppState.getState(), 'seekToGoal')
        const host = document.createElement('div')
        render(<TimelineMarkers host={host} durationSec={200} />)
        fireEvent.click(host.querySelectorAll('.timeline-marker')[1])
        expect(seek).toHaveBeenCalledWith(0, 90)
    })
})
