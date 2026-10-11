import { describe, expect, it } from 'vitest'
import { findGoalsProgress } from './findGoalsProgress'

const idle = { phase: 'idle', fraction: 0, ballPhase: 'idle', ballFraction: 0, ballEp: null }
describe('findGoalsProgress', () => {
    it('should be null when nothing runs', () => expect(findGoalsProgress({ ...idle, phase: 'done' })).toBeNull())
    it('should describe the audio phase', () => expect(findGoalsProgress({ ...idle, phase: 'running', fraction: 0.66 })).toEqual({ line: 'Listening for the roar… 66%', percent: 66 }))
    it('should describe the ball model loading, then the check', () => {
        expect(findGoalsProgress({ ...idle, phase: 'done', ballPhase: 'running' })?.line).toBe('Loading the ball model…')
        expect(findGoalsProgress({ ...idle, phase: 'done', ballPhase: 'running', ballFraction: 0.3, ballEp: 'webgpu' })).toEqual({ line: 'Checking the goal mouths… 30%', percent: 30 })
    })
})
