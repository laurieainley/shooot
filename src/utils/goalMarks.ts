import type { CropRect, GoalMarks, GoalMarksByTeam, Pt } from '../types'
import { MIN_BOX_W, clampRect } from './crop'

const pts = (m: GoalMarks): Pt[] => [m.postL, m.postR, m.barL, m.barR, ...(m.backL ? [m.backL] : []), ...(m.backR ? [m.backR] : [])]

/** Replay zoom box covering the goal: bounding box padded by 30% of the goal width (≥ 0.04), square in frame fractions. */
export function goalRectFromMarks(m: GoalMarks): CropRect {
    const p = pts(m), xs = p.map((q) => q.x), ys = p.map((q) => q.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const pad = Math.max(0.04, 0.3 * Math.abs(m.postR.x - m.postL.x))
    // Widen to the smallest allowed box before centring, so a small far goal stays centred in its box.
    const side = Math.min(1, Math.max(MIN_BOX_W, Math.max(x1 - x0, y1 - y0) + 2 * pad))
    return clampRect({ x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, w: side, h: side })
}

const postHeight = (m: GoalMarks): number => (Math.hypot(m.postL.x - m.barL.x, m.postL.y - m.barL.y) + Math.hypot(m.postR.x - m.barR.x, m.postR.y - m.barR.y)) / 2

/** A goal close to the camera: tall in the picture (≥ 12% of the frame height) with the back of the net marked. */
export function isNearGoal(m: GoalMarks): boolean {
    return !!m.backL && !!m.backR && postHeight(m) >= 0.12
}

export function footprint(m: GoalMarks): Pt[] | null {
    return m.backL && m.backR ? [m.postL, m.postR, m.backR, m.backL] : null
}

function inside(poly: { x: number; y: number }[], x: number, y: number): boolean {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
    }
    return c
}

function distToEdges(poly: { x: number; y: number }[], x: number, y: number): number {
    let d = Infinity
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i], dx = b.x - a.x, dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        d = Math.min(d, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
    }
    return d
}

/** Is a detected ball (pixel box: centre x, bottom y, width) inside this goal? Near: on the floor inside the net; far: behind the goal line, between the posts, under the bar. */
export function ballInGoal(ball: { cx: number; bottom: number; w: number }, m: GoalMarks, frame: { w: number; h: number }): boolean {
    const P = (q: Pt): { x: number; y: number } => ({ x: q.x * frame.w, y: q.y * frame.h })
    if (isNearGoal(m)) {
        const poly = footprint(m)!.map(P)
        const expected = 0.18 * postHeight(m) * frame.h
        return ball.w >= 0.6 * expected && inside(poly, ball.cx, ball.bottom) && distToEdges(poly, ball.cx, ball.bottom) >= 8
    }
    const a = P(m.postL), b = P(m.postR), c = P(m.barL), d = P(m.barR)
    if (ball.cx < Math.min(a.x, b.x) - 3 || ball.cx > Math.max(a.x, b.x) + 3) return false
    const lineY = a.y + ((b.y - a.y) * (ball.cx - a.x)) / ((b.x - a.x) || 1)
    const barY = c.y + ((d.y - c.y) * (ball.cx - c.x)) / ((d.x - c.x) || 1)
    return ball.bottom <= lineY + 2 && ball.bottom >= barY
}

const isPt = (v: unknown): v is Pt => !!v && typeof v === 'object' && Number.isFinite((v as Pt).x) && Number.isFinite((v as Pt).y)
/** Clamped to the frame and rounded to 4 decimals (about 0.2 px on 4K), which keeps transfer links short. */
const r4 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000
const clampPt = (p: Pt): Pt => ({ x: r4(p.x), y: r4(p.y) })

function normaliseOne(v: unknown): GoalMarks | undefined {
    if (!v || typeof v !== 'object') return undefined
    const o = v as Record<string, unknown>
    if (!isPt(o.postL) || !isPt(o.postR) || !isPt(o.barL) || !isPt(o.barR)) return undefined
    const m: GoalMarks = { postL: clampPt(o.postL), postR: clampPt(o.postR), barL: clampPt(o.barL), barR: clampPt(o.barR) }
    if (isPt(o.backL) && isPt(o.backR)) { m.backL = clampPt(o.backL); m.backR = clampPt(o.backR) }
    return m
}

/** Marks from persisted / imported data; malformed goals are dropped; null when none is usable. */
export function normaliseGoalMarks(v: unknown): GoalMarksByTeam | null {
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>, out: GoalMarksByTeam = {}
    const t1 = normaliseOne(o.team1), t2 = normaliseOne(o.team2)
    if (t1) out.team1 = t1
    if (t2) out.team2 = t2
    return out.team1 || out.team2 ? out : null
}

export function swapGoalMarks(m: GoalMarksByTeam): GoalMarksByTeam {
    const out: GoalMarksByTeam = {}
    if (m.team2) out.team1 = m.team2
    if (m.team1) out.team2 = m.team1
    return out
}
