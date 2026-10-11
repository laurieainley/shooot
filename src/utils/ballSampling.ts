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

/** Sample times around a suggestion: `fps` over [t − before, t + after] (13 values by default), clamped to [0, total] (clamped duplicates dropped). */
export function sampleTimes(t: number, opts: { total: number; fps?: number; before?: number; after?: number }): number[] {
    const { total, fps = 2, before = 3, after = 3 } = opts
    const n = Math.round((before + after) * fps)
    const all = Array.from({ length: n + 1 }, (_, i) => Math.min(total, Math.max(0, t - before + i / fps)))
    return all.filter((v, i) => i === 0 || v !== all[i - 1])
}

const GOALS: GoalTeam[] = ['team1', 'team2']
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function tileFor(goal: GoalTeam, m: GoalMarks, f: Frame): GoalTile {
    if (isNearGoal(m)) {
        // Pixel-square crop (aspect preserved): centred on the rectangle, side = its longer pixel side.
        const r = goalRectFromMarks(m)
        const side = Math.min(Math.max(r.w * f.w, r.h * f.h), f.w, f.h)
        const cx = (r.x + r.w / 2) * f.w, cy = (r.y + r.h / 2) * f.h
        return { goal, sx: clamp(cx - side / 2, 0, f.w - side), sy: clamp(cy - side / 2, 0, f.h - side), sw: side, sh: side, scaleX: TILE / side, scaleY: TILE / side }
    }
    const pts = [m.postL, m.postR, m.barL, m.barR]
    const cx = (pts.reduce((a, p) => a + p.x, 0) / 4) * f.w, cy = (pts.reduce((a, p) => a + p.y, 0) / 4) * f.h
    const sw = Math.min(TILE, f.w), sh = Math.min(TILE, f.h)
    return { goal, sx: clamp(cx - sw / 2, 0, f.w - sw), sy: clamp(cy - sh / 2, 0, f.h - sh), sw, sh, scaleX: TILE / sw, scaleY: TILE / sh }
}

/** One tile per marked goal: near goal = a pixel-square crop around its replay rectangle; far goal = native-scale pixels centred on the mouth. */
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
const STATIC_SHARE = 0.8
const centre = (b: Box): { x: number; y: number } => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 })

/**
 * Was the ball in a goal around the suggestion at `t`? Needs a ball inside the goal (`ballInGoal`) in at least 2 sampled
 * frames within [t − 3, t + 3] s. A detection that sits at the same place (±8 px) in at least 80% of the sampled frames of that goal
 * and in the first one (t − 3), is a fixture (a ball-shaped patch of the scene) and is ignored. The goal with most frames wins.
 */
export function ballVerdict(samples: BallSample[], marks: GoalMarksByTeam, frame: Frame, t: number): BallVerdict | null {
    let best: BallVerdict | null = null
    for (const goal of GOALS) {
        const m = marks[goal]
        const own = samples.filter((s) => s.goal === goal)
        if (!m || own.length === 0) continue
        const first = own.reduce((a, s) => (s.timeSec < a.timeSec ? s : a))
        const near = (c: { x: number; y: number }, s: BallSample): boolean =>
            s.boxes.some((o) => { const q = centre(o); return Math.abs(q.x - c.x) <= STATIC_PX && Math.abs(q.y - c.y) <= STATIC_PX })
        const isStatic = (b: Box): boolean => {
            const c = centre(b)
            return near(c, first) && own.filter((s) => near(c, s)).length >= STATIC_SHARE * own.length
        }
        let frames = 0
        for (const s of own) {
            if (s.timeSec < t - 3 || s.timeSec > t + 3) continue
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
