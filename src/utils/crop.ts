import type { CropRect, GoalAreas, ReplayCrop } from '../types'

/** Smallest box the editors allow (a goal area of 20 % of the frame width). */
export const MIN_BOX_W = 0.2
/** Replay zoom range of the slider: 1× is the whole frame. */
export const MAX_REPLAY_ZOOM = 3
/** Crops narrower than this are visibly soft on 1080p footage. */
export const SOFT_BELOW_W = 0.35
export const DEFAULT_BOX_W = 0.4

const num = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback)

/** The box inside the frame with the frame's aspect (h = w as fractions) and a size from MIN_BOX_W to the whole frame. */
export function clampRect(r: CropRect): CropRect {
    const w = Math.min(1, Math.max(MIN_BOX_W, num(r.w, DEFAULT_BOX_W)))
    return {
        x: Math.min(1 - w, Math.max(0, num(r.x, 0))),
        y: Math.min(1 - w, Math.max(0, num(r.y, 0))),
        w,
        h: w,
    }
}

export function moveRect(r: CropRect, dx: number, dy: number): CropRect {
    return clampRect({ ...r, x: r.x + dx, y: r.y + dy })
}

/** New width, anchored at the top-left corner (the bottom-right handle drags); slides back inside the frame if needed. */
export function resizeRect(r: CropRect, w: number): CropRect {
    return clampRect({ x: r.x, y: r.y, w, h: w })
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br'

/**
 * Drag one corner by (dx, dy) as fractions of the frame: the opposite corner stays put, the aspect stays locked
 * (the larger pull along either axis wins) and the box stops at the minimum size or the frame edge.
 */
export function resizeFromCorner(r: CropRect, corner: Corner, dx: number, dy: number): CropRect {
    const left = corner === 'tl' || corner === 'bl'
    const top = corner === 'tl' || corner === 'tr'
    const pullX = (left ? -1 : 1) * num(dx, 0)
    const pullY = (top ? -1 : 1) * num(dy, 0)
    const pull = Math.abs(pullX) >= Math.abs(pullY) ? pullX : pullY
    const ax = left ? r.x + r.w : r.x
    const ay = top ? r.y + r.h : r.y
    const room = Math.min(left ? ax : 1 - ax, top ? ay : 1 - ay)
    const w = Math.max(MIN_BOX_W, Math.min(room, r.w + pull))
    return { x: left ? ax - w : ax, y: top ? ay - w : ay, w, h: w }
}

export const zoomOf = (r: CropRect): number => 1 / r.w

/** The box of a given zoom (1× = whole frame) around the centre of `r`. */
export function zoomRect(r: CropRect, zoom: number): CropRect {
    const z = Math.min(MAX_REPLAY_ZOOM, Math.max(1, num(zoom, 1)))
    const w = 1 / z
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    return z === 1
        ? { x: 0, y: 0, w: 1, h: 1 }
        : { x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - w, Math.max(0, cy - w / 2)), w, h: w }
}

export const isSoft = (r: CropRect): boolean => r.w < SOFT_BELOW_W - 1e-9

export const FULL_FRAME: CropRect = { x: 0, y: 0, w: 1, h: 1 }
export const isFullFrame = (r: CropRect): boolean => r.w >= 1 - 1e-6

/** Goal mouths are usually low in the picture; the default boxes sit at each end of the field (team 1 on the left). */
export function defaultGoalAreas(): GoalAreas {
    return {
        team1: clampRect({ x: 0.04, y: 0.28, w: DEFAULT_BOX_W, h: DEFAULT_BOX_W }),
        team2: clampRect({ x: 1 - 0.04 - DEFAULT_BOX_W, y: 0.28, w: DEFAULT_BOX_W, h: DEFAULT_BOX_W }),
    }
}

/** The two boxes trade owners (the camera shows the other goal as each team's own). */
export function swapGoalAreas(a: GoalAreas): GoalAreas {
    return { team1: a.team2, team2: a.team1 }
}

/** Source rectangle in pixels for drawImage. */
export function cropPixels(r: CropRect, width: number, height: number): { sx: number; sy: number; sw: number; sh: number } {
    return { sx: r.x * width, sy: r.y * height, sw: r.w * width, sh: r.h * height }
}

/**
 * The player's CSS transform (translate(pan) scale(zoom) about the centre of the picture) that shows `r` filling the view.
 * A point `d` from the centre lands at `pan + zoom·d`, so the box centre is moved to the middle.
 */
export function cropTransform(r: CropRect, viewport: { width: number; height: number }): { zoom: number; pan: { x: number; y: number } } {
    const zoom = 1 / r.w
    if (zoom <= 1 + 1e-9) return { zoom: 1, pan: { x: 0, y: 0 } }
    return {
        zoom,
        pan: { x: -(r.x + r.w / 2 - 0.5) * viewport.width * zoom, y: -(r.y + r.h / 2 - 0.5) * viewport.height * zoom },
    }
}

const isRectLike = (v: unknown): v is CropRect => {
    if (!v || typeof v !== 'object') return false
    const r = v as Record<string, unknown>
    return typeof r.x === 'number' && typeof r.y === 'number' && typeof r.w === 'number' && typeof r.h === 'number'
}

/**
 * Goal areas from persisted / imported data: clamped, or null when there is no rectangle. Older projects stored
 * `left` / `right` plus a flag for the direction the first team attacked in: that box is the second team's goal.
 */
export function normaliseAreas(v: unknown, whitesAttackLeft = true): GoalAreas | null {
    if (!v || typeof v !== 'object') return null
    const o = v as { left?: unknown; right?: unknown; team1?: unknown; team2?: unknown }
    if (isRectLike(o.left) && isRectLike(o.right)) {
        const left = clampRect(o.left)
        const right = clampRect(o.right)
        return whitesAttackLeft ? { team1: right, team2: left } : { team1: left, team2: right }
    }
    const out: GoalAreas = {}
    if (isRectLike(o.team1)) out.team1 = clampRect(o.team1)
    if (isRectLike(o.team2)) out.team2 = clampRect(o.team2)
    return out.team1 || out.team2 ? out : null
}

/** A stored replay framing: legacy 'left' / 'right' become the team that defended that goal. */
export function migrateReplayCrop(c: unknown, whitesAttackLeft = true): ReplayCrop | undefined {
    if (c === 'left') return whitesAttackLeft ? 'team2' : 'team1'
    if (c === 'right') return whitesAttackLeft ? 'team1' : 'team2'
    if (c === 'team1' || c === 'team2' || c === 'full') return c
    return isRectLike(c) ? c : undefined
}
