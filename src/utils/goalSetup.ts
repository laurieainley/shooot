import type { CropRect, GoalMarks, Pt } from '../types'
import { MIN_BOX_W, clampRect } from './crop'
import type { MarkKey } from './goalMarkSteps'
import { clampZoom, type Pan } from './zoom'

/**
 * Pure maths for the guided goal set-up. Views are `translate(pan) scale(zoom)` about the centre of the viewport
 * (like the player's zoom); the picture is letterboxed inside the viewport at zoom 1.
 */
export type Viewport = { width: number; height: number }
export type View = { zoom: number; pan: Pan }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** The picture's size in px at zoom 1: the largest box of the frame's aspect that fits the viewport. */
export function contentSize(viewport: Viewport, aspect: number): { w: number; h: number } {
    const a = aspect > 0 ? aspect : 16 / 9
    return { w: Math.min(viewport.width, viewport.height * a), h: Math.min(viewport.height, viewport.width / a) }
}

/** Pan limit: a picture edge can be brought to the crosshair (the viewport centre), never further. */
export function clampViewPan(zoom: number, pan: Pan, viewport: Viewport, aspect: number): Pan {
    const c = contentSize(viewport, aspect)
    const mx = (zoom * c.w) / 2, my = (zoom * c.h) / 2
    return { x: Math.max(-mx, Math.min(mx, pan.x)), y: Math.max(-my, Math.min(my, pan.y)) }
}

/** The frame point (0..1 each way) under `at` (px from the viewport centre; default the crosshair at the centre). */
export function viewToFrame(view: View, viewport: Viewport, aspect: number, at: Pan = { x: 0, y: 0 }): Pt {
    const c = contentSize(viewport, aspect)
    const z = view.zoom || 1
    return { x: clamp01(0.5 + (at.x - view.pan.x) / z / c.w), y: clamp01(0.5 + (at.y - view.pan.y) / z / c.h) }
}

/** The pan that puts frame point `p` under the crosshair. */
export function panToCentre(p: Pt, zoom: number, viewport: Viewport, aspect: number): Pan {
    const c = contentSize(viewport, aspect)
    return clampViewPan(zoom, { x: -(p.x - 0.5) * c.w * zoom, y: -(p.y - 0.5) * c.h * zoom }, viewport, aspect)
}

/** Multiply the zoom by `factor` keeping the picture point under `cursor` (px from the viewport centre) where it is. */
export function zoomViewAt(view: View, factor: number, cursor: Pan, viewport: Viewport, aspect: number, max: number): View {
    const zoom = clampZoom(view.zoom * factor, max)
    const k = zoom / view.zoom
    return {
        zoom,
        pan: clampViewPan(zoom, { x: cursor.x - (cursor.x - view.pan.x) * k, y: cursor.y - (cursor.y - view.pan.y) * k }, viewport, aspect),
    }
}

const DEFAULT_GOAL_W = 0.12
const POST_HEIGHT_PER_WIDTH = 0.6 // a five-a-side goal is about 3 m wide and 2 m tall
const BACK_OFFSET_X = 0.1
const BACK_OFFSET_Y = 0.5

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
const clampPt = (p: Pt): Pt => ({ x: clamp01(p.x), y: clamp01(p.y) })

/**
 * Where the next point probably is, as a frame point to bring under the crosshair. `placed` are this goal's points so
 * far; `other` is the other goal when it has been set (goals usually face each other across the frame and look alike).
 */
export function guessNextPoint(key: MarkKey, placed: Partial<GoalMarks>, other: GoalMarks | null | undefined): Pt {
    const centre = { x: 0.5, y: 0.5 }
    const width = placed.postL && placed.postR ? Math.abs(placed.postR.x - placed.postL.x) : other ? Math.abs(other.postR.x - other.postL.x) : DEFAULT_GOAL_W
    const height =
        placed.postL && placed.barL ? dist(placed.postL, placed.barL)
            : other ? (dist(other.postL, other.barL) + dist(other.postR, other.barR)) / 2
                : width * POST_HEIGHT_PER_WIDTH
    const { postL, postR, barL } = placed
    switch (key) {
        case 'postL': return other ? clampPt({ x: 1 - other.postR.x, y: other.postR.y }) : centre
        case 'postR': return postL ? clampPt({ x: postL.x + width, y: postL.y }) : centre
        case 'barL': return postL ? clampPt({ x: postL.x, y: postL.y - height }) : centre
        case 'barR':
            if (!postR) return centre
            return barL && postL ? clampPt({ x: postR.x + (barL.x - postL.x), y: postR.y + (barL.y - postL.y) }) : clampPt({ x: postR.x, y: postR.y - height })
        case 'backL': return postL ? clampPt({ x: postL.x - BACK_OFFSET_X * width, y: postL.y + BACK_OFFSET_Y * height }) : centre
        case 'backR': return postR ? clampPt({ x: postR.x + BACK_OFFSET_X * width, y: postR.y + BACK_OFFSET_Y * height }) : centre
    }
}

const CLOSER = 0.8

/** One Closer / Wider step: the box gets 0.8 × / ÷ 0.8 as wide about its centre, within the allowed sizes and the frame. */
export function stepBox(r: CropRect, dir: 'closer' | 'wider'): CropRect {
    return resizeAbout(r, dir === 'closer' ? r.w * CLOSER : r.w / CLOSER)
}

/** A pinch of `scale` (fingers apart = > 1) on the replay view: the box shrinks by that factor about its centre. */
export function pinchBox(r: CropRect, scale: number): CropRect {
    return resizeAbout(r, r.w / (scale > 0 ? scale : 1))
}

function resizeAbout(r: CropRect, w: number): CropRect {
    const nw = Math.min(1, Math.max(MIN_BOX_W, w))
    return clampRect({ x: r.x + r.w / 2 - nw / 2, y: r.y + r.h / 2 - nw / 2, w: nw, h: nw })
}

/** Tapping the corner map moves the box so it is centred on that frame point. */
export function mapTapToBox(r: CropRect, tap: Pt): CropRect {
    return clampRect({ x: tap.x - r.w / 2, y: tap.y - r.h / 2, w: r.w, h: r.h })
}

/** Dragging the replay view by (dx, dy) px moves what is shown the other way; `view` is the replay view's size in px. */
export function panBox(r: CropRect, dx: number, dy: number, view: Viewport): CropRect {
    return clampRect({ ...r, x: r.x - (dx / (view.width || 1)) * r.w, y: r.y - (dy / (view.height || 1)) * r.h })
}

/** Position of the full picture inside a frame-aspect view so that exactly `r` shows (an `<img>` absolutely placed). */
export function cropImageStyle(r: CropRect): { width: string; height: string; left: string; top: string } {
    return {
        width: `${(100 / r.w)}%`,
        height: `${(100 / r.h)}%`,
        left: `${(-r.x / r.w) * 100}%`,
        top: `${(-r.y / r.h) * 100}%`,
    }
}
