// Match graphics as draw-op lists in a 1920×1080 design space (paint.ts scales them to the output size).
// Visual language from the user's cards: navy ground, orange headings, Bebas Neue, team-colour shields.
import type { Box } from '../../paint'
import { MULTI_OUTLINE } from '../../teamFill'
import { INK_DARK, WHITE, type TeamBadge } from '../../teamStyle'

export const NAVY = '#0f2347'
export const NAVY_DARK = '#0c1a33'
export const ORANGE = '#f28c28'
export const BLUE = '#2d9be0'
import type { BugSpec, CaptionSpec, CardSpec } from '../../types'

import { CAPTION_DELAY_SEC, CAPTION_SEC, CARD_SEC, DESIGN_H, DESIGN_W, OVERLAY_FADE, SAFE_X, SAFE_Y, cardFade, clamp01, easeOut } from '../../layout'
export { CAPTION_DELAY_SEC, CAPTION_SEC, CARD_SEC, DESIGN_H, DESIGN_W, SAFE_X, SAFE_Y, cardFade }

type Alpha = { alpha?: number }
export type RectOp = { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string } & Alpha
export type TextOp = {
    kind: 'text'; text: string; x: number; y: number; size: number; color: string
    align: 'left' | 'center' | 'right'; baseline: 'alphabetic' | 'middle'; maxWidth?: number
    /** Dark outline drawn under the text (white initials over a multicolour shield). */
    outline?: string
} & Alpha
export type ShieldOp = { kind: 'shield'; cx: number; cy: number; w: number; h: number; fill: string; stroke: string; lineWidth: number; box?: Box } & Alpha
/** The league logo, `h` tall, width from its aspect ratio; x is its centre (`center`) or left edge. */
export type LogoOp = { kind: 'logo'; x: number; y: number; h: number; align: 'center' | 'left'; box?: Box } & Alpha
export type BackgroundOp = { kind: 'cardBackground' }
export type DrawOp = RectOp | TextOp | ShieldOp | LogoOp | BackgroundOp

/** Text width in design pixels; the painter supplies real font metrics, tests use the estimate. */
export type MeasureText = (text: string, size: number) => number

/** Rough advance width of upper-case Bebas Neue text (it is narrow: ~0.4 em per glyph). */
export function estimateTextWidth(text: string, size: number): number {
    return text.length * size * 0.4
}


function team(t: TeamBadge, cx: number): DrawOp[] {
    const cy = 600
    return [
        { kind: 'shield', cx, cy, w: 250, h: 290, fill: t.colour, stroke: WHITE, lineWidth: 8, box: { x: SAFE_X, y: SAFE_Y, w: DESIGN_W - 2 * SAFE_X, h: 1060 - SAFE_Y } },
        { kind: 'text', text: t.initials, x: cx, y: cy - 10, size: 120, color: t.ink === INK_DARK ? NAVY : t.ink, align: 'center', baseline: 'middle', maxWidth: 210, ...(t.colour === 'multi' ? { outline: MULTI_OUTLINE } : {}) },
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
    const fade = cardFade(t, duration)
    if (fade < 1) ops.push({ kind: 'rect', x: 0, y: 0, w: DESIGN_W, h: DESIGN_H, fill: '#000000', alpha: 1 - fade })
    return ops
}

const withMotion = (ops: DrawOp[], alpha: number, dx: number): DrawOp[] =>
    ops.map((o) => (o.kind === 'cardBackground' ? o : { ...o, ...(o.kind === 'shield' ? { cx: o.cx + dx } : { x: o.x + dx }), alpha: (o.alpha ?? 1) * alpha }))

function motion(t: number, duration: number): { alpha: number; dx: number } {
    const p = easeOut(clamp01(Math.min(t / OVERLAY_FADE, (duration - t) / OVERLAY_FADE)))
    return { alpha: p, dx: -60 * (1 - p) }
}

/** Captions, the score bug and the REPLAY tag are drawn 1.05× the original design (1.4×, then 25 % smaller). */
export const OVERLAY_SCALE = 1.05
const k = (v: number): number => Math.round(v * OVERLAY_SCALE)

const BUG_H = k(64)
const BUG_PAD = k(16)
const BUG_BAR = k(8)
const ACCENT_H = k(4)
const EVENT_H = k(72)
const NOTE_H = k(50)
/** Captions stay left of the REPLAY tag (top right). */
const CAPTION_MAX_RIGHT = 1480

/** Design-space rows the score bug / a caption can touch (with room for anti-aliasing). */
export const BUG_ROWS: [number, number] = [SAFE_Y - 14, SAFE_Y + BUG_H + ACCENT_H + 14]
/** Under the event line: an optional assist line, then an optional note, each one NOTE_H band. */
export const CAPTION_ROWS: [number, number] = [SAFE_Y - 14, SAFE_Y + BUG_H + ACCENT_H + EVENT_H + 2 * NOTE_H + 14]

/** TV-style score bug row at the top-left title-safe corner: [logo] ▌WH  1–0  CO▐ with an orange underline. */
function bugRow(bug: BugSpec, hasLogo: boolean, measure: MeasureText): { ops: DrawOp[]; right: number } {
    const initialsSize = k(44)
    const scoreSize = k(50)
    const y = SAFE_Y
    const cy = y + BUG_H / 2
    let x = SAFE_X
    const ops: DrawOp[] = []
    if (hasLogo) {
        ops.push({ kind: 'rect', x, y, w: BUG_H, h: BUG_H, fill: NAVY_DARK })
        ops.push({ kind: 'logo', x: x + BUG_H / 2, y: y + k(7), h: BUG_H - 2 * k(7), align: 'center', box: { x, y, w: BUG_H, h: BUG_H } })
        x += BUG_H
    }
    const initialsW = Math.max(measure(bug.left, initialsSize), measure(bug.right, initialsSize)) + 2 * BUG_PAD
    const scoreW = Math.max(k(80), measure(bug.text, scoreSize) + 2 * BUG_PAD)
    const right = x + 2 * BUG_BAR + 2 * initialsW + scoreW
    ops.push({ kind: 'rect', x, y, w: right - x, h: BUG_H, fill: NAVY })
    ops.push({ kind: 'rect', x, y, w: BUG_BAR, h: BUG_H, fill: bug.leftColour })
    ops.push({ kind: 'text', text: bug.left, x: x + BUG_BAR + initialsW / 2, y: cy, size: initialsSize, color: WHITE, align: 'center', baseline: 'middle' })
    const sx = x + BUG_BAR + initialsW
    ops.push({ kind: 'rect', x: sx, y, w: scoreW, h: BUG_H, fill: NAVY_DARK })
    ops.push({ kind: 'text', text: bug.text, x: sx + scoreW / 2, y: cy, size: scoreSize, color: WHITE, align: 'center', baseline: 'middle' })
    ops.push({ kind: 'text', text: bug.right, x: sx + scoreW + initialsW / 2, y: cy, size: initialsSize, color: WHITE, align: 'center', baseline: 'middle' })
    ops.push({ kind: 'rect', x: right - BUG_BAR, y, w: BUG_BAR, h: BUG_H, fill: bug.rightColour })
    ops.push({ kind: 'rect', x: SAFE_X, y: y + BUG_H, w: right - SAFE_X, h: ACCENT_H, fill: ORANGE })
    return { ops, right }
}

/** The score bug on its own: still while a window runs through the whole cut, or sliding / fading in and out over 0.3 s when it comes and goes. */
export function scoreBugLayout(bug: BugSpec, t: number, duration: number, hasLogo: boolean, fade: boolean | { in: boolean; out: boolean }, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const { ops } = bugRow(bug, hasLogo, measure)
    const f = typeof fade === 'boolean' ? { in: fade, out: fade } : fade
    if (!f.in && !f.out) return ops.map((o) => (o.kind === 'cardBackground' ? o : { ...o, alpha: 1 }))
    // A window split at a file join keeps going there: no fade at that edge.
    const p = easeOut(clamp01(Math.min(f.in ? t / OVERLAY_FADE : 1, f.out ? (duration - t) / OVERLAY_FADE : 1)))
    return withMotion(ops, p, -60 * (1 - p))
}

/**
 * Event caption, top-left (TV score-bug convention): the score bug row with the event line beneath
 * (`GOAL · SAM TAYLOR`, then smaller `ASSIST: JO` and note lines). 5 s, sliding and fading in and out over 0.3 s.
 */
export function captionLayout(spec: CaptionSpec, t: number, hasLogo: boolean, duration = CAPTION_SEC, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const bug = spec.bug ? bugRow(spec.bug, hasLogo, measure) : null
    const top = bug ? SAFE_Y + BUG_H + ACCENT_H : SAFE_Y
    const stripeW = k(10)
    const pad = k(22)
    const gap = k(20)
    const labelSize = k(54)
    const noteSize = k(36)
    const textX = SAFE_X + stripeW + pad
    const labelW = measure(spec.label, labelSize)
    const personX = textX + labelW + gap
    const personW = spec.person ? measure(spec.person, labelSize) : 0
    // Smaller lines under the event line, in order: the assist, then the note.
    const assistText = spec.assist ? `ASSIST: ${spec.assist}` : undefined
    const subLines = [assistText, spec.note].filter((s): s is string => !!s)
    const subW = Math.max(0, ...subLines.map((s) => measure(s, noteSize)))
    const contentRight = Math.max(spec.person ? personX + personW : textX + labelW, textX + subW) + pad
    const right = Math.min(CAPTION_MAX_RIGHT, Math.max(bug?.right ?? 0, contentRight, textX + k(200)))
    const h = EVENT_H + subLines.length * NOTE_H
    const event: DrawOp[] = [
        { kind: 'rect', x: SAFE_X, y: top, w: stripeW, h, fill: spec.stripe },
        { kind: 'rect', x: SAFE_X + stripeW, y: top, w: right - SAFE_X - stripeW, h, fill: NAVY },
        { kind: 'text', text: spec.label, x: textX, y: top + EVENT_H / 2, size: labelSize, color: ORANGE, align: 'left', baseline: 'middle' },
    ]
    if (spec.person) {
        event.push({ kind: 'text', text: spec.person, x: personX, y: top + EVENT_H / 2, size: labelSize, color: WHITE, align: 'left', baseline: 'middle', maxWidth: Math.max(80, right - pad - personX) })
    }
    subLines.forEach((text, i) => {
        event.push({ kind: 'text', text, x: textX, y: top + EVENT_H + NOTE_H * i + NOTE_H / 2, size: noteSize, color: '#c9d6ea', align: 'left', baseline: 'middle', maxWidth: Math.max(80, right - pad - textX) })
    })
    const m = motion(t, duration)
    const bugOps = bug ? withMotion(bug.ops, m.alpha, m.dx) : []
    return [...bugOps, ...withMotion(event, m.alpha, m.dx)]
}

/** Design-space rows of the REPLAY tag. */
export const REPLAY_ROWS: [number, number] = [SAFE_Y - 8, SAFE_Y + k(64) + 14]

/** Small "REPLAY" tag, top right, shown instantly for the length of a slowed replay (broadcast convention; captions are top left), for the length of a slowed replay. */
export function replayTagLayout(t: number, duration: number, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const bar = k(8)
    // Wide enough for the text in whatever font is in use (a fallback face is wider than Bebas Neue).
    const w = Math.max(k(150), bar + measure('REPLAY', k(48)) + 2 * k(16))
    const h = k(64)
    const x = DESIGN_W - SAFE_X - w
    const y = SAFE_Y
    const ops: DrawOp[] = [
        { kind: 'rect', x, y, w, h, fill: NAVY },
        { kind: 'rect', x, y, w: bar, h, fill: ORANGE },
        { kind: 'text', text: 'REPLAY', x: x + bar + (w - bar) / 2, y: y + h / 2, size: k(48), color: WHITE, align: 'center', baseline: 'middle' },
    ]
    // Appears and disappears instantly (no fade or slide), unlike the captions.
    void t
    void duration
    return ops.map((o) => (o.kind === 'cardBackground' ? o : { ...o, alpha: 1 }))
}
