// Match graphics as draw-op lists in a 1920×1080 design space (paint.ts scales them to the output size).
// Visual language from the user's cards: navy ground, orange headings, Bebas Neue, team-colour shields.
import { BLUE, NAVY, NAVY_DARK, ORANGE, WHITE, type TeamBadge } from './teamStyle'
import type { CardSpec, LowerThirdSpec } from './types'

export const DESIGN_W = 1920
export const DESIGN_H = 1080
/** Title-safe margins (5 %). */
export const SAFE_X = 96
export const SAFE_Y = 54

export const CARD_SEC = 4
export const LOWER_THIRD_SEC = 3
const CARD_FADE = 0.5
const OVERLAY_FADE = 0.3

type Alpha = { alpha?: number }
export type RectOp = { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string } & Alpha
export type TextOp = {
    kind: 'text'; text: string; x: number; y: number; size: number; color: string
    align: 'left' | 'center' | 'right'; baseline: 'alphabetic' | 'middle'; maxWidth?: number
} & Alpha
export type ShieldOp = { kind: 'shield'; cx: number; cy: number; w: number; h: number; fill: string; stroke: string; lineWidth: number } & Alpha
/** The league logo, `h` tall, width from its aspect ratio; x is its centre (`center`) or left edge. */
export type LogoOp = { kind: 'logo'; x: number; y: number; h: number; align: 'center' | 'left' } & Alpha
export type BackgroundOp = { kind: 'cardBackground' }
export type DrawOp = RectOp | TextOp | ShieldOp | LogoOp | BackgroundOp

/** Rough advance width of upper-case Bebas Neue text (it is narrow: ~0.4 em per glyph). */
export function estimateTextWidth(text: string, size: number): number {
    return text.length * size * 0.4
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
const easeOut = (p: number): number => 1 - (1 - p) ** 3

function team(t: TeamBadge, cx: number): DrawOp[] {
    const cy = 600
    return [
        { kind: 'shield', cx, cy, w: 250, h: 290, fill: t.colour, stroke: WHITE, lineWidth: 8 },
        { kind: 'text', text: t.initials, x: cx, y: cy - 10, size: 120, color: t.ink, align: 'center', baseline: 'middle', maxWidth: 210 },
        { kind: 'text', text: t.name, x: cx, y: 845, size: 68, color: WHITE, align: 'center', baseline: 'alphabetic', maxWidth: Math.min(720, 2 * Math.min(cx - SAFE_X, 960 - Math.abs(cx - 960)) - 40) },
        { kind: 'rect', x: cx - 60, y: 868, w: 120, h: 8, fill: t.colour },
    ]
}

/** VS or full-time card at `t` seconds of a `duration`-second card (fades from and to black). */
export function cardLayout(spec: CardSpec, t: number, duration: number, hasLogo: boolean): DrawOp[] {
    const ops: DrawOp[] = [{ kind: 'cardBackground' }]
    if (hasLogo) ops.push({ kind: 'logo', x: 960, y: 50, h: 170, align: 'center' })
    ops.push({ kind: 'text', text: spec.heading, x: 960, y: 320, size: 84, color: ORANGE, align: 'center', baseline: 'alphabetic', maxWidth: 1400 })
    ops.push(...team(spec.left, 520), ...team(spec.right, 1400))
    ops.push({ kind: 'text', text: spec.centre, x: 960, y: 610, size: spec.centre === 'VS' ? 200 : 220, color: WHITE, align: 'center', baseline: 'middle', maxWidth: 560 })
    ops.push({ kind: 'rect', x: 0, y: 1060, w: 640, h: 20, fill: ORANGE }, { kind: 'rect', x: 640, y: 1060, w: 1280, h: 20, fill: BLUE })
    const fade = clamp01(Math.min(t / CARD_FADE, (duration - t) / CARD_FADE))
    if (fade < 1) ops.push({ kind: 'rect', x: 0, y: 0, w: DESIGN_W, h: DESIGN_H, fill: '#000000', alpha: 1 - fade })
    return ops
}

const withMotion = (ops: DrawOp[], alpha: number, dx: number): DrawOp[] =>
    ops.map((o) => (o.kind === 'cardBackground' ? o : { ...o, ...(o.kind === 'shield' ? { cx: o.cx + dx } : { x: o.x + dx }), alpha: (o.alpha ?? 1) * alpha }))

function motion(t: number, duration: number): { alpha: number; dx: number } {
    const p = easeOut(clamp01(Math.min(t / OVERLAY_FADE, (duration - t) / OVERLAY_FADE)))
    return { alpha: p, dx: -60 * (1 - p) }
}

/** Lower third at `t` seconds: stripe, navy panel with label + person (+ note), score box for scoring events. */
export function lowerThirdLayout(spec: LowerThirdSpec, t: number, hasLogo: boolean, duration = LOWER_THIRD_SEC): DrawOp[] {
    const right = DESIGN_W - SAFE_X
    const bottom = 960
    const row1 = 96
    const row2 = spec.note ? 60 : 0
    const h = row1 + row2
    const top = bottom - h
    const stripeW = 14
    const pad = 28
    const logoW = hasLogo ? 72 : 0
    const textX = SAFE_X + stripeW + pad + (hasLogo ? logoW + 20 : 0)

    const labelSize = 64
    const labelW = estimateTextWidth(spec.label, labelSize)
    const personX = textX + labelW + 26
    const scoreText = spec.score ? `${spec.score.left} ${spec.score.text} ${spec.score.right}` : ''
    const scoreW = spec.score ? estimateTextWidth(scoreText, 60) + 2 * pad : 0
    const maxPanelRight = right - scoreW
    const personW = spec.person ? estimateTextWidth(spec.person, labelSize) : 0
    const noteW = spec.note ? estimateTextWidth(spec.note, 40) : 0
    const contentRight = Math.max(personX + personW - (spec.person ? 0 : 26), textX + noteW)
    const panelRight = Math.min(maxPanelRight, Math.max(textX + 360, contentRight + pad))

    const ops: DrawOp[] = [
        { kind: 'rect', x: SAFE_X, y: top, w: stripeW, h, fill: spec.stripe },
        { kind: 'rect', x: SAFE_X + stripeW, y: top, w: panelRight - SAFE_X - stripeW, h, fill: NAVY, alpha: 0.94 },
    ]
    if (hasLogo) ops.push({ kind: 'logo', x: SAFE_X + stripeW + pad, y: top + (row1 - logoW) / 2, h: logoW, align: 'left' })
    ops.push({ kind: 'text', text: spec.label, x: textX, y: top + row1 / 2 + 4, size: labelSize, color: ORANGE, align: 'left', baseline: 'middle' })
    if (spec.person) {
        ops.push({ kind: 'text', text: spec.person, x: personX, y: top + row1 / 2 + 4, size: labelSize, color: WHITE, align: 'left', baseline: 'middle', maxWidth: Math.max(80, panelRight - pad - personX) })
    }
    if (spec.note) {
        ops.push({ kind: 'text', text: spec.note, x: textX, y: top + row1 + row2 / 2 - 6, size: 40, color: '#c9d6ea', align: 'left', baseline: 'middle', maxWidth: Math.max(80, panelRight - pad - textX) })
    }
    if (spec.score) {
        ops.push({ kind: 'rect', x: panelRight, y: top, w: scoreW, h, fill: NAVY_DARK, alpha: 0.96 })
        const cy = top + h / 2 + 4
        const mid = panelRight + scoreW / 2
        const numW = estimateTextWidth(spec.score.text, 60)
        ops.push(
            { kind: 'text', text: spec.score.left, x: mid - numW / 2 - 14, y: cy, size: 48, color: '#c9d6ea', align: 'right', baseline: 'middle' },
            { kind: 'text', text: spec.score.text, x: mid, y: cy, size: 60, color: WHITE, align: 'center', baseline: 'middle' },
            { kind: 'text', text: spec.score.right, x: mid + numW / 2 + 14, y: cy, size: 48, color: '#c9d6ea', align: 'left', baseline: 'middle' },
        )
    }
    const barRight = panelRight + scoreW
    const split = SAFE_X + (barRight - SAFE_X) / 3
    ops.push(
        { kind: 'rect', x: SAFE_X, y: bottom, w: split - SAFE_X, h: 6, fill: ORANGE },
        { kind: 'rect', x: split, y: bottom, w: barRight - split, h: 6, fill: BLUE },
    )
    const m = motion(t, duration)
    return withMotion(ops, m.alpha, m.dx)
}

/** Small "REPLAY" tag, top right, for the length of a slowed replay. */
export function replayTagLayout(t: number, duration: number): DrawOp[] {
    const w = 210
    const x = DESIGN_W - SAFE_X - w
    const y = 64
    const ops: DrawOp[] = [
        { kind: 'rect', x, y, w, h: 64, fill: NAVY, alpha: 0.94 },
        { kind: 'rect', x, y, w: 8, h: 64, fill: ORANGE },
        { kind: 'text', text: 'REPLAY', x: x + 8 + (w - 8) / 2, y: y + 36, size: 48, color: WHITE, align: 'center', baseline: 'middle' },
    ]
    const m = motion(t, duration)
    return withMotion(ops, m.alpha, 0)
}
