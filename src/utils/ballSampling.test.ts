import { describe, expect, it } from 'vitest'
import { ballVerdict, goalTiles, sampleTimes, scoringTeam, tileToSource, type BallSample, type Box } from './ballSampling'
import { goalRectFromMarks } from './goalMarks'
import type { GoalMarks, Team } from '../types'

// near goal as in the test footage (4K frame 3840×2160): fractions from user marks (copied from goalMarks.test.ts)
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
const box = (cx: number, bottom: number, w: number): Box => ({ x1: cx - w / 2, y1: bottom - w, x2: cx + w / 2, y2: bottom, score: 0.8 })
const inNear = box(3350, 1250, 60), inFar = box(1120, 515, 14)
const at = (timeSec: number, goal: 'team1' | 'team2', ...boxes: Box[]): BallSample => ({ timeSec, goal, boxes })

describe('sampleTimes', () => {
    it('should give 13 times at 2 fps over t − 3 .. t + 3', () => {
        const ts = sampleTimes(100, { total: 1000 })
        expect(ts).toHaveLength(13)
        expect(ts[0]).toBe(97); expect(ts[1]).toBe(97.5); expect(ts[12]).toBe(103)
    })
    it('should clamp to the footage', () => {
        const ts = sampleTimes(1, { total: 3 })
        expect(ts).toHaveLength(13)
        expect(Math.min(...ts)).toBe(0); expect(Math.max(...ts)).toBe(3)
    })
})

describe('goalTiles', () => {
    it('should make a tile per marked goal only', () => {
        expect(goalTiles({ team2: FAR }, F).map((t) => t.goal)).toEqual(['team2'])
        expect(goalTiles({}, F)).toEqual([])
        expect(goalTiles({ team1: FAR, team2: NEAR }, F).map((t) => t.goal)).toEqual(['team1', 'team2'])
    })
    it('should crop a pixel square around the near goal replay rectangle', () => {
        const [t] = goalTiles({ team1: NEAR }, F)
        const r = goalRectFromMarks(NEAR)
        expect(t.scaleX).toBe(t.scaleY); expect(t.sw).toBe(t.sh)
        expect(t.sw).toBeCloseTo(Math.max(r.w * F.w, r.h * F.h)); expect(t.sw * t.scaleX).toBeCloseTo(384)
        for (const p of [NEAR.postL, NEAR.postR, NEAR.barL, NEAR.barR]) {
            expect(p.x * F.w).toBeGreaterThanOrEqual(t.sx); expect(p.x * F.w).toBeLessThanOrEqual(t.sx + t.sw)
            expect(p.y * F.h).toBeGreaterThanOrEqual(t.sy); expect(p.y * F.h).toBeLessThanOrEqual(t.sy + t.sh)
        }
        expect(t.sx).toBeGreaterThanOrEqual(0); expect(t.sx + t.sw).toBeLessThanOrEqual(F.w)
    })
    it('should centre a native-scale 384 tile on the far goal mouth', () => {
        const [t] = goalTiles({ team1: FAR }, F)
        expect([t.sw, t.sh, t.scaleX, t.scaleY]).toEqual([384, 384, 1, 1])
        const cx = ((1023 + 1216 + 1017 + 1211) / 4), cy = ((535 + 508 + 469 + 448) / 4)
        expect(t.sx + 192).toBeCloseTo(cx); expect(t.sy + 192).toBeCloseTo(cy)
    })
    it('should clamp the far tile inside the frame', () => {
        const edge: GoalMarks = { postL: { x: 0.001, y: 0.99 }, postR: { x: 0.03, y: 0.99 }, barL: { x: 0.001, y: 0.95 }, barR: { x: 0.03, y: 0.95 } }
        const [t] = goalTiles({ team1: edge }, F)
        expect(t.sx).toBe(0); expect(t.sy + t.sh).toBe(F.h)
    })
})

describe('tileToSource', () => {
    it('should map tile boxes back to source pixels (near and far)', () => {
        const [near] = goalTiles({ team1: NEAR }, F)
        const b = tileToSource({ x1: 0, y1: 0, x2: 384, y2: 384, score: 0.5 }, near)
        expect(b.x1).toBeCloseTo(near.sx); expect(b.x2).toBeCloseTo(near.sx + near.sw); expect(b.y2).toBeCloseTo(near.sy + near.sh)
        const [far] = goalTiles({ team1: FAR }, F)
        expect(tileToSource({ x1: 10, y1: 20, x2: 30, y2: 40, score: 0.5 }, far)).toEqual({ x1: far.sx + 10, y1: far.sy + 20, x2: far.sx + 30, y2: far.sy + 40, score: 0.5 })
    })
})

describe('ballVerdict', () => {
    const marks = { team1: NEAR, team2: FAR }
    it('should confirm a ball in the near goal in 2+ frames in the window', () => {
        const s = [at(97, 'team1'), at(100, 'team1', inNear), at(101, 'team1', box(3360, 1260, 60)), at(103, 'team1')]
        expect(ballVerdict(s, marks, F, 100)).toEqual({ goal: 'team1', frames: 2 })
    })
    it('should confirm the far goal', () => {
        const s = [at(99.5, 'team2', inFar), at(100, 'team2', box(1124, 514, 14)), at(97, 'team2')]
        expect(ballVerdict(s, marks, F, 100)).toEqual({ goal: 'team2', frames: 2 })
    })
    it('should not count a single frame', () => {
        expect(ballVerdict([at(100, 'team1', inNear), at(101, 'team1')], marks, F, 100)).toBeNull()
    })
    it('should ignore frames outside [t − 3, t + 3]', () => {
        expect(ballVerdict([at(96.5, 'team1', inNear), at(96.8, 'team1', inNear), at(103.5, 'team1', inNear), at(97, 'team1')], marks, F, 100)).toBeNull()
    })
    it('should count a ball in the net at t − 2.5 … t − 1 that is gone by t as a goal', () => {
        const s = [at(97, 'team1'), at(97.5, 'team1', inNear), at(98, 'team1', box(3355, 1255, 60)), at(99, 'team1', box(3360, 1260, 60)), at(100, 'team1'), at(103, 'team1')]
        expect(ballVerdict(s, marks, F, 100)).toEqual({ goal: 'team1', frames: 3 })
    })
    it('should treat a ball present from t − 3 through t + 3 as static', () => {
        const s = [97, 98, 99, 100, 101, 102, 103].map((x) => at(x, 'team1', inNear))
        expect(ballVerdict(s, marks, F, 100)).toBeNull()
    })
    it('should ignore a ball in front of the line', () => {
        const out = box(2900, 1250, 60)
        expect(ballVerdict([at(100, 'team1', out), at(101, 'team1', out), at(97, 'team1')], marks, F, 100)).toBeNull()
    })
    it('should ignore a detection that never moves, including at t − 3', () => {
        const s = [at(97, 'team1', inNear), at(98, 'team1', inNear), at(100, 'team1', box(3353, 1252, 60)), at(101, 'team1', inNear)]
        expect(ballVerdict(s, marks, F, 100)).toBeNull()
    })
    it('should still treat a resting ball as static when one frame misses it', () => {
        const s = [at(97, 'team1', inNear), at(98, 'team1', inNear), at(99, 'team1'), at(100, 'team1', inNear), at(101, 'team1', inNear), at(102, 'team1', inNear), at(103, 'team1', inNear)]
        expect(ballVerdict(s, marks, F, 100)).toBeNull()
    })
    it('should not treat a ball that arrives at t + 0.5 as static', () => {
        const s = [at(97, 'team1'), at(98, 'team1'), at(99, 'team1'), at(100.5, 'team1', inNear), at(101, 'team1', inNear), at(102, 'team1', inNear), at(103, 'team1', inNear)]
        expect(ballVerdict(s, marks, F, 100)).toEqual({ goal: 'team1', frames: 4 })
    })
    it('should keep a moving ball even when a static patch is also detected', () => {
        const patch = box(3300, 1300, 60)
        const s = [at(97, 'team1', patch), at(100, 'team1', patch, inNear), at(101, 'team1', patch, box(3360, 1262, 60))]
        expect(ballVerdict(s, marks, F, 100)).toEqual({ goal: 'team1', frames: 2 })
    })
    it('should only check goals that are marked', () => {
        const s = [at(100, 'team2', inFar), at(101, 'team2', inFar), at(97, 'team2')]
        expect(ballVerdict(s, { team1: NEAR }, F, 100)).toBeNull()
    })
    it('should pick the goal with more frames', () => {
        const s = [at(99.5, 'team1', inNear), at(100, 'team1', box(3360, 1260, 60)), at(99.5, 'team2', inFar), at(100, 'team2', box(1124, 514, 14)), at(101, 'team2', box(1126, 513, 14)), at(97, 'team1'), at(97, 'team2')]
        expect(ballVerdict(s, marks, F, 100)).toEqual({ goal: 'team2', frames: 3 })
    })
})

describe('scoringTeam', () => {
    const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }]
    it('should name the attacker of each goal in the first half', () => {
        expect(scoringTeam('team1', teams, null, 100)).toBe('Colours')
        expect(scoringTeam('team2', teams, 600, 100)).toBe('Whites')
    })
    it('should swap ends after half time', () => {
        expect(scoringTeam('team1', teams, 600, 600)).toBe('Whites')
        expect(scoringTeam('team2', teams, 600, 900)).toBe('Colours')
    })
    it('should be undefined when the team is missing', () => {
        expect(scoringTeam('team1', [teams[0]], null, 0)).toBeUndefined()
    })
})
