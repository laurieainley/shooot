import { describe, expect, it } from 'vitest'
import { ballInGoal, footprint, goalRectFromMarks, isNearGoal, normaliseGoalMarks, swapGoalMarks } from './goalMarks'
import type { GoalMarks } from '../types'

// near goal as in the test footage (4K frame 3840×2160): fractions from user marks
const NEAR: GoalMarks = {
    postL: { x: 3072 / 3840, y: 1285 / 2160 }, postR: { x: 3339 / 3840, y: 1006 / 2160 },
    barL: { x: 3174 / 3840, y: 854 / 2160 }, barR: { x: 3396 / 3840, y: 732 / 2160 },
    backL: { x: 3474 / 3840, y: 1450 / 2160 }, backR: { x: 3586 / 3840, y: 1068 / 2160 },
}
const FAR: GoalMarks = {
    postL: { x: 1023 / 3840, y: 535 / 2160 }, postR: { x: 1216 / 3840, y: 508 / 2160 },
    barL: { x: 1017 / 3840, y: 469 / 2160 }, barR: { x: 1211 / 3840, y: 448 / 2160 },
}
const F = { w: 3840, h: 2160 }

describe('goalRectFromMarks', () => {
    it('should cover every point with a square-in-fractions rectangle inside the frame', () => {
        const r = goalRectFromMarks(NEAR)
        expect(r.w).toBeCloseTo(r.h)
        for (const p of Object.values(NEAR)) { expect(p.x).toBeGreaterThanOrEqual(r.x); expect(p.x).toBeLessThanOrEqual(r.x + r.w); expect(p.y).toBeGreaterThanOrEqual(r.y); expect(p.y).toBeLessThanOrEqual(r.y + r.h) }
        expect(r.x + r.w).toBeLessThanOrEqual(1); expect(r.y + r.h).toBeLessThanOrEqual(1)
    })
})
describe('isNearGoal / footprint', () => {
    it('should treat a tall goal with back corners as near and give its floor polygon', () => {
        expect(isNearGoal(NEAR)).toBe(true)
        expect(footprint(NEAR)).toHaveLength(4)
    })
    it('should use the averaged post height: a short left post with a tall right post is still near', () => {
        const m: GoalMarks = {
            postL: { x: 0.3, y: 0.5 }, barL: { x: 0.3, y: 0.42 },   // 0.08 tall
            postR: { x: 0.5, y: 0.6 }, barR: { x: 0.5, y: 0.4 },    // 0.20 tall, mean 0.14
            backL: { x: 0.35, y: 0.55 }, backR: { x: 0.55, y: 0.6 },
        }
        expect(isNearGoal(m)).toBe(true)
    })
    it('should treat a small goal or one without back corners as far', () => {
        expect(isNearGoal(FAR)).toBe(false)
        expect(footprint(FAR)).toBeNull()
        const noBack: GoalMarks = { postL: NEAR.postL, postR: NEAR.postR, barL: NEAR.barL, barR: NEAR.barR }
        expect(isNearGoal(noBack)).toBe(false)
    })
})
describe('ballInGoal', () => {
    it('near: inside the floor footprint and big enough', () => {
        expect(ballInGoal({ cx: 3350, bottom: 1250, w: 60 }, NEAR, F)).toBe(true)
        expect(ballInGoal({ cx: 2900, bottom: 1250, w: 60 }, NEAR, F)).toBe(false)   // in front of the goal line
        expect(ballInGoal({ cx: 3350, bottom: 1250, w: 15 }, NEAR, F)).toBe(false)   // too small: clutter
    })
    it('far: between the posts, behind the goal line and under the bar', () => {
        expect(ballInGoal({ cx: 1120, bottom: 515, w: 14 }, FAR, F)).toBe(true)
        expect(ballInGoal({ cx: 1120, bottom: 540, w: 14 }, FAR, F)).toBe(false)     // in front of the line
        expect(ballInGoal({ cx: 1300, bottom: 515, w: 14 }, FAR, F)).toBe(false)     // outside the posts
        expect(ballInGoal({ cx: 1120, bottom: 440, w: 14 }, FAR, F)).toBe(false)     // above the bar
    })
})
describe('normaliseGoalMarks / swapGoalMarks', () => {
    it('should round points to 4 decimals', () => {
        const m = { postL: { x: 0.123456, y: 0.2 }, postR: { x: 0.3, y: 0.2 }, barL: { x: 0.1, y: 0.1 }, barR: { x: 0.3, y: 0.1 } }
        expect(normaliseGoalMarks({ team1: m })!.team1!.postL).toEqual({ x: 0.1235, y: 0.2 })
    })

    it('should keep valid goals, drop malformed ones and clamp to the frame', () => {
        const out = normaliseGoalMarks({ team1: { ...FAR, postL: { x: 1.5, y: 0.2 } }, team2: { postL: { x: NaN, y: 0 } } })
        expect(out?.team1?.postL.x).toBe(1)
        expect(out?.team2).toBeUndefined()
        expect(normaliseGoalMarks('nope')).toBeNull()
        expect(normaliseGoalMarks({ team1: { postL: { x: 0.1, y: 0.1 } } })).toBeNull()
    })
    it('should swap teams', () => {
        expect(swapGoalMarks({ team1: NEAR })).toEqual({ team2: NEAR })
    })
})
