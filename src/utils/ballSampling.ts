import type { GoalMarks, GoalMarksByTeam, GoalTeam, Team } from '../types'
import { ballInGoal, goalRectFromMarks, isNearGoal } from './goalMarks'

/** Side of the square tile fed to the ball model. */
export const TILE = 384
export type Frame = { w: number; h: number }
export type Box = { x1: number; y1: number; x2: number; y2: number; score: number }
/** A source-pixel region (sx, sy, sw, sh) of the frame that is scaled to a TILE×TILE image (scaleX/scaleY = tile px per source px). */
export type GoalTile = { goal: GoalTeam; sx: number; sy: number; sw: number; sh: number; scaleX: number; scaleY: number }
export type BallSample = { timeSec: number; goal: GoalTeam; boxes: Box[] }
export type BallVerdict = { goal: GoalTeam; frames: number }

/** Sample times around a suggestion: `fps` over [t − before, t + after] (13 values by default), clamped to [0, total]. */
export function sampleTimes(t: number, opts: { total: number; fps?: number; before?: number; after?: number }): number[] {
    const { total, fps = 2, before = 3, after = 3 } = opts
    const n = Math.round((before + after) * fps)
    return Array.from({ length: n + 1 }, (_, i) => Math.min(total, Math.max(0, t - before + i / fps)))
}

const GOALS: GoalTeam[] = ['team1', 'team2']
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function tileFor(goal: GoalTeam, m: GoalMarks, f: Frame): GoalTile {
    if (isNearGoal(m)) {
        const r = goalRectFromMarks(m)
        const sw = r.w * f.w, sh = r.h * f.h
        return { goal, sx: r.x * f.w, sy: r.y * f.h, sw, sh, scaleX: TILE / sw, scaleY: TILE / sh }
    }
    const pts = [m.postL, m.postR, m.barL, m.barR]
    const cx = (pts.reduce((a, p) => a + p.x, 0) / 4) * f.w, cy = (pts.reduce((a, p) => a + p.y, 0) / 4) * f.h
    const sw = Math.min(TILE, f.w), sh = Math.min(TILE, f.h)
    return { goal, sx: clamp(cx - sw / 2, 0, f.w - sw), sy: clamp(cy - sh / 2, 0, f.h - sh), sw, sh, scaleX: TILE / sw, scaleY: TILE / sh }
}

/** One tile per marked goal: near goal = its replay rectangle scaled to the tile; far goal = native-scale pixels centred on the mouth. */
export function goalTiles(marks: GoalMarksByTeam, frame: Frame): GoalTile[] {
    return GOALS.flatMap((g) => (marks[g] ? [tileFor(g, marks[g]!, frame)] : []))
}

/** A box in tile pixels back to source pixels. */
export function tileToSource(box: Box, tile: GoalTile): Box {
    return {
        x1: tile.sx + box.x1 / tile.scaleX, y1: tile.sy + box.y1 / tile.scaleY,
        x2: tile.sx + box.x2 / tile.scaleX, y2: tile.sy + box.y2 / tile.scaleY, score: box.score,
    }
}

const STATIC_PX = 8
const centre = (b: Box): { x: number; y: number } => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 })

/**
 * Was the ball in a goal around the suggestion at `t`? Needs a ball inside the goal (`ballInGoal`) in at least 2 sampled
 * frames within [t − 1, t + 3] s. A detection that sits at the same place (±8 px) in every sampled frame of that goal,
 * including t − 3, is a fixture (a ball-shaped patch of the scene) and is ignored. The goal with most frames wins.
 */
export function ballVerdict(samples: BallSample[], marks: GoalMarksByTeam, frame: Frame, t: number): BallVerdict | null {
    let best: BallVerdict | null = null
    for (const goal of GOALS) {
        const m = marks[goal]
        const own = samples.filter((s) => s.goal === goal)
        if (!m || own.length === 0) continue
        const isStatic = (b: Box): boolean => {
            const c = centre(b)
            return own.every((s) => s.boxes.some((o) => { const q = centre(o); return Math.abs(q.x - c.x) <= STATIC_PX && Math.abs(q.y - c.y) <= STATIC_PX }))
        }
        let frames = 0
        for (const s of own) {
            if (s.timeSec < t - 1 || s.timeSec > t + 3) continue
            if (s.boxes.some((b) => !isStatic(b) && ballInGoal({ cx: (b.x1 + b.x2) / 2, bottom: b.y2, w: b.x2 - b.x1 }, m, frame))) frames++
        }
        if (frames >= 2 && (!best || frames > best.frames)) best = { goal, frames }
    }
    return best
}

/** The team attacking `goal` (so the one that scored there): before half time the team that does not defend it; ends swap after the Half time marker. */
export function scoringTeam(goal: GoalTeam, teams: Team[], halfTimeSec: number | null, timeSec: number): string | undefined {
    const swapped = halfTimeSec !== null && timeSec >= halfTimeSec
    const defenders = goal === 'team1' ? 0 : 1
    const attacker = swapped ? defenders : 1 - defenders
    return teams[attacker]?.name || undefined
}
