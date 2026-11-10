// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GoalDiagram } from './GoalDiagram'

describe('GoalDiagram', () => {
    it('should draw the back corners further away than the posts: higher up and nearer the middle, with the net drawn before the frame', () => {
        const { container } = render(<GoalDiagram current="postL" placed={{}} />)
        const dot = (n: number) => { const c = container.querySelectorAll('.gs-diagram__dot')[n]; return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) } }
        const [postL, postR, , , backL, backR] = [0, 1, 2, 3, 4, 5].map(dot)
        expect(backL.y).toBeLessThan(postL.y)
        expect(backR.y).toBeLessThan(postR.y)
        expect(backL.x).toBeGreaterThan(postL.x)
        expect(backR.x).toBeLessThan(postR.x)
        const paths = [...container.querySelectorAll('svg > path')].map((p) => p.getAttribute('class'))
        expect(paths).toEqual(['gs-diagram__net', 'gs-diagram__frame'])
    })
})
