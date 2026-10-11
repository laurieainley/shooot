import { describe, expect, it } from 'vitest'
import { isComplete, nextStep, promptFor } from './goalMarkSteps'

describe('goal mark steps', () => {
    it('should ask for the required points in order, then the optional ones', () => {
        expect(nextStep({}, new Set())).toBe('postL')
        const p = { x: 0.5, y: 0.5 }
        expect(nextStep({ postL: p, postR: p, barL: p, barR: p }, new Set())).toBe('backL')
        expect(nextStep({ postL: p, postR: p, barL: p, barR: p }, new Set(['backL', 'backR']))).toBeNull()
    })
    it('should word prompts for touch', () => {
        expect(promptFor('postL', false)).toBe('Click the bottom of the left post')
        expect(promptFor('postL', true)).toBe('Tap the bottom of the left post')
        expect(promptFor('backR', false)).toBe('Click the back-right corner of the net on the floor (optional)')
    })
    it('should be complete with the four required points', () => {
        const p = { x: 0.5, y: 0.5 }
        expect(isComplete({ postL: p, postR: p, barL: p })).toBe(false)
        expect(isComplete({ postL: p, postR: p, barL: p, barR: p })).toBe(true)
    })
})
