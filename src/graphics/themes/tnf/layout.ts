// TNF graphics as draw-op lists in a 1920×1080 design space (paint.ts scales them to the output size).
// Visual language: the league badge: sky-blue rounded panels with a white rim, shirt-yellow tabs and pills, orange/white
// 45° stripes, navy ground. No lean. Voices: display (Barlow Condensed ExtraBold Italic, every word), mono (clocks and minutes).
import type { Box } from '../../paint'
import { MULTI_OUTLINE } from '../../teamFill'
import type { BugSpec, CaptionSpec, CardSpec, ScorerLine } from '../../types'
import { PRODUCT_NAME } from '../../../brand'
import { T } from './colors'
import type { FontVoice } from './fonts'

import { CAPTION_DELAY_SEC, CAPTION_SEC, CARD_SEC, DESIGN_H, DESIGN_W, OVERLAY_FADE, SAFE_X, SAFE_Y, cardFade, clamp01, easeOut } from '../../layout'
export { CAPTION_DELAY_SEC, CAPTION_SEC, CARD_SEC, DESIGN_H, DESIGN_W, SAFE_X, SAFE_Y, cardFade }

type Alpha = { alpha?: number }
/** A rounded rectangle; `stroke` is a rim drawn centred on its edge. */
export type RectOp = { kind: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: string; stroke?: string; lineWidth?: number } & Alpha
export type TextOp = {
    kind: 'text'; text: string; x: number; y: number; size: number; color: string; voice: FontVoice
    align: 'left' | 'center' | 'right'; baseline: 'alphabetic' | 'middle'; maxWidth?: number
    /** Dark outline drawn under the text (white initials over a multicolour field). */
    outline?: string
} & Alpha
/** The league logo, `h` tall, width from its aspect ratio; x is its centre (`center`) or left edge. */
export type LogoOp = { kind: 'logo'; x: number; y: number; h: number; align: 'center' | 'left'; box?: Box } & Alpha
/** Orange / white 45° stripes (the badge motif) clipped to a rounded rectangle, stripes `sw` wide. */
export type StripesOp = { kind: 'stripes'; x: number; y: number; w: number; h: number; r: number; sw: number } & Alpha
/** The same stripes as a band across the whole frame between two design rows. */
export type BandOp = { kind: 'band'; y: number; h: number; sw: number } & Alpha
/** A row of `count` five-point white stars centred on (cx, cy), each `r` in radius. */
export type StarsOp = { kind: 'stars'; cx: number; cy: number; r: number; count: number; fill: string } & Alpha
export type BackgroundOp = { kind: 'cardBackground' } & Alpha
export type DrawOp = RectOp | TextOp | LogoOp | StripesOp | BandOp | StarsOp | BackgroundOp
type Shape = Exclude<DrawOp, BackgroundOp | BandOp>

/** Text width in design pixels; the painter supplies real font metrics, tests use the estimate. */
export type MeasureText = (text: string, size: number, voice?: FontVoice) => number

const EM_WIDTH: Record<FontVoice, number> = { display: 0.55, mono: 0.6 }
export function estimateTextWidth(text: string, size: number, voice: FontVoice = 'display'): number {
    return text.length * size * EM_WIDTH[voice]
}

/** `0.5` → `0.5×`, `1/3` → `0.33×`. */
export function formatSpeed(speed: number): string {
    return `${+speed.toFixed(2)}×`
}

const RIM = 4
const rim = { stroke: T.white, lineWidth: RIM } as const

const txt = (text: string, x: number, y: number, size: number, color: string, voice: FontVoice, align: TextOp['align'], extra: Partial<TextOp> = {}): TextOp =>
    ({ kind: 'text', text, x, y, size, color, voice, align, baseline: 'middle', ...extra })

/** Three stars, plus a star either side of a heading: the badge's ornament. */
const headingRow = (text: string, cy: number, size: number, maxWidth: number, measure: MeasureText): DrawOp[] => {
    const w = Math.min(maxWidth, measure(text, size, 'display'))
    const r = size * 0.42
    const off = w / 2 + r * 2.2
    return [
        { kind: 'stars', cx: 960 - off, cy, r, count: 1, fill: T.white },
        txt(text, 960, cy, size, T.yellow, 'display', 'center', { maxWidth }),
        { kind: 'stars', cx: 960 + off, cy, r, count: 1, fill: T.white },
    ]
}

const FULL_TIME_ROWS = 5
const SCORER_Y = 770
const SCORER_STEP = 58

/** One column of scorers under a team: names right-aligned to the centre line, minutes (mono, yellow) left of it. */
function scorerColumn(lines: ScorerLine[], cx: number): DrawOp[] {
    const shown = lines.length > FULL_TIME_ROWS ? lines.slice(0, FULL_TIME_ROWS - 1) : lines
    const ops: DrawOp[] = []
    shown.forEach((l, i) => {
        const y = SCORER_Y + i * SCORER_STEP
        ops.push(txt(l.name, cx - 16, y, 46, T.white, 'display', 'right', { maxWidth: 330 }))
        ops.push(txt(l.minutes, cx + 16, y, 36, T.yellow, 'mono', 'left', { maxWidth: 300 }))
    })
    if (shown.length < lines.length) {
        ops.push(txt(`+${lines.length - shown.length} MORE`, cx, SCORER_Y + shown.length * SCORER_STEP, 36, T.white, 'mono', 'center', { maxWidth: 400, alpha: 0.7 }))
    }
    return ops
}

/** "Made with Shooot ●": small, at the foot of the full-time card. */
function endLine(measure: MeasureText): DrawOp[] {
    const size = 28
    const text = `Made with ${PRODUCT_NAME}`
    const w = measure(text, size, 'mono')
    const gap = 16
    const dot = 8
    const left = DESIGN_W / 2 - (w + gap + 2 * dot) / 2
    const y = 1030
    return [
        txt(text, left, y, size, T.white, 'mono', 'left', { alpha: 0.6 }),
        { kind: 'rect', x: left + w + gap, y: y - dot, w: 2 * dot, h: 2 * dot, r: dot, fill: T.orange },
    ]
}

const PLATE_W = 520

/** A team: a sky-blue plate with a white rim holding the name, and a kit-colour bar under it. */
function teamPlate(t: CardSpec['left'], cx: number, cy: number, h: number, size: number): DrawOp[] {
    return [
        { kind: 'rect', x: cx - PLATE_W / 2, y: cy - h / 2, w: PLATE_W, h, r: 14, fill: T.sky, ...rim },
        txt(t.name, cx, cy, size, T.white, 'display', 'center', { maxWidth: PLATE_W - 56, ...(t.colour === 'multi' ? { outline: MULTI_OUTLINE } : {}) }),
        { kind: 'rect', x: cx - 70, y: cy + h / 2 + 16, w: 140, h: 10, r: 5, fill: t.colour },
    ]
}

/** VS or full-time card at `t` seconds of a `duration`-second card (fades from and to black). */
export function cardLayout(spec: CardSpec, t: number, duration: number, hasLogo: boolean, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const vs = spec.centre === 'VS'
    const ops: DrawOp[] = [{ kind: 'cardBackground' }, { kind: 'band', y: vs ? 380 : 170, h: vs ? 330 : 270, sw: 54, alpha: 0.14 }]
    if (vs) {
        if (hasLogo) ops.push({ kind: 'logo', x: 960, y: 90, h: 430, align: 'center' })
        ops.push(...headingRow(spec.heading, 590, 52, 1000, measure))
        ops.push(...teamPlate(spec.left, 520, 760, 150, 66), ...teamPlate(spec.right, 1400, 760, 150, 66))
        ops.push({ kind: 'rect', x: 850, y: 665, w: 220, h: 190, r: 18, fill: T.yellow, ...rim })
        ops.push(txt(spec.centre, 960, 760, 100, T.navy, 'display', 'center', { maxWidth: 190 }))
    } else {
        if (hasLogo) ops.push({ kind: 'logo', x: 960, y: 40, h: 320, align: 'center' })
        ops.push(...headingRow(spec.heading, 400, 50, 900, measure))
        ops.push(...teamPlate(spec.left, 450, 570, 130, 58), ...teamPlate(spec.right, 1470, 570, 130, 58))
        ops.push({ kind: 'rect', x: 790, y: 485, w: 340, h: 170, r: 18, fill: T.yellow, ...rim })
        ops.push(txt(spec.centre, 960, 570, 104, T.navy, 'display', 'center', { maxWidth: 300 }))
        if (spec.scorers) ops.push(...scorerColumn(spec.scorers.left, 450), ...scorerColumn(spec.scorers.right, 1470))
        ops.push(...endLine(measure))
    }
    const fade = cardFade(t, duration)
    if (fade < 1) ops.push({ kind: 'rect', x: -DESIGN_W, y: -DESIGN_H, w: 3 * DESIGN_W, h: 3 * DESIGN_H, r: 0, fill: '#000000', alpha: 1 - fade })
    return ops
}

function shifted(o: Shape, dx: number): Shape {
    return o.kind === 'stars' ? { ...o, cx: o.cx + dx } : { ...o, x: o.x + dx }
}

const withMotion = (ops: Shape[], alpha: number, dx: number): DrawOp[] =>
    ops.map((o) => ({ ...shifted(o, dx), alpha: (o.alpha ?? 1) * alpha }))

function motion(t: number, duration: number): { alpha: number; dx: number } {
    const p = easeOut(clamp01(Math.min(t / OVERLAY_FADE, (duration - t) / OVERLAY_FADE)))
    return { alpha: p, dx: -60 * (1 - p) }
}

const BUG_H = 72
const EVENT_H = 80
const NOTE_H = 50
const GAP = 8
/** Captions stay left of the REPLAY tag (top right). */
const CAPTION_MAX_RIGHT = 1360

/** Design-space rows the score bug / a caption can touch (with room for the rim and anti-aliasing). */
export const BUG_ROWS: [number, number] = [SAFE_Y - 14, SAFE_Y + BUG_H + 14]
/** Under the bug: the event plate, plus an optional assist line and an optional note. */
export const CAPTION_ROWS: [number, number] = [SAFE_Y - 14, SAFE_Y + BUG_H + GAP + EVENT_H + 2 * NOTE_H + 14]

/** Score bug row from (x0, y): [logo] ▌WH ( 1–0 ) CO▐: a rimmed sky-blue plate, the score on a yellow pill, kit-colour bars inside the rim. */
function bugRow(bug: BugSpec, hasLogo: boolean, measure: MeasureText, x0: number, y: number): { ops: Shape[]; right: number } {
    const initialsSize = 42
    const scoreSize = 44
    const pad = 20
    const bar = 8
    const cy = y + BUG_H / 2
    const logoW = hasLogo ? 62 : 0
    const initialsW = Math.max(measure(bug.left, initialsSize, 'display'), measure(bug.right, initialsSize, 'display')) + 2 * pad
    const pillW = Math.max(100, measure(bug.text, scoreSize, 'mono') + 2 * 22)
    const inner = 16 + logoW + (hasLogo ? 10 : 0)
    const right = x0 + inner + bar + initialsW + pillW + initialsW + bar + 16
    const ops: Shape[] = [{ kind: 'rect', x: x0, y, w: right - x0, h: BUG_H, r: 14, fill: T.sky, ...rim }]
    let x = x0 + 16
    if (hasLogo) {
        ops.push({ kind: 'logo', x: x + logoW / 2, y: y + 6, h: BUG_H - 12, align: 'center', box: { x, y: y + 6, w: logoW, h: BUG_H - 12 } })
        x += logoW + 10
    }
    ops.push({ kind: 'rect', x, y: y + 14, w: bar, h: BUG_H - 28, r: 4, fill: bug.leftColour })
    ops.push(txt(bug.left, x + bar + initialsW / 2, cy, initialsSize, T.white, 'display', 'center'))
    const sx = x + bar + initialsW
    ops.push({ kind: 'rect', x: sx, y: y + 10, w: pillW, h: BUG_H - 20, r: (BUG_H - 20) / 2, fill: T.yellow })
    ops.push(txt(bug.text, sx + pillW / 2, cy, scoreSize, T.navy, 'mono', 'center'))
    ops.push(txt(bug.right, sx + pillW + initialsW / 2, cy, initialsSize, T.white, 'display', 'center'))
    ops.push({ kind: 'rect', x: sx + pillW + initialsW, y: y + 14, w: bar, h: BUG_H - 28, r: 4, fill: bug.rightColour })
    return { ops, right }
}

const BUG_X = SAFE_X + RIM / 2

/** The score bug on its own: still while a window runs through the whole cut, or sliding / fading in and out over 0.3 s when it comes and goes. */
export function scoreBugLayout(bug: BugSpec, t: number, duration: number, hasLogo: boolean, fade: boolean | { in: boolean; out: boolean }, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const ops = bugRow(bug, hasLogo, measure, BUG_X, SAFE_Y).ops
    const f = typeof fade === 'boolean' ? { in: fade, out: fade } : fade
    if (!f.in && !f.out) return ops.map((o) => ({ ...o, alpha: 1 }))
    // A window split at a file join keeps going there: no fade at that edge.
    const p = easeOut(clamp01(Math.min(f.in ? t / OVERLAY_FADE : 1, f.out ? (duration - t) / OVERLAY_FADE : 1)))
    return withMotion(ops, p, -60 * (1 - p))
}

/**
 * Event caption, top-left: the score bug with the event plate beneath: a yellow tab with the event word (navy; goals
 * add an orange/white stripe flourish), the player's name in white and the minute in mono, then smaller `ASSIST: JO`
 * and note lines inside the same plate. 5 s, sliding and fading in and out over 0.3 s.
 */
export function captionLayout(spec: CaptionSpec, t: number, hasLogo: boolean, duration = CAPTION_SEC, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const assistText = spec.assist ? `ASSIST: ${spec.assist}` : undefined
    const subLines = [assistText, spec.note].filter((s): s is string => !!s)
    const bug = spec.bug ? bugRow(spec.bug, hasLogo, measure, BUG_X, SAFE_Y) : null
    const top = spec.bug ? SAFE_Y + BUG_H + GAP : SAFE_Y
    const h = EVENT_H + subLines.length * NOTE_H

    const labelSize = 50
    const nameSize = 52
    const subSize = 38
    const minuteSize = 34
    const pad = 22
    const gap = 16
    const tone = spec.tone ?? 'goal'
    const stripeW = tone === 'goal' ? 22 : 0
    const tabX = BUG_X + 8
    const tabH = EVENT_H - 16
    const textX = tabX + (stripeW ? stripeW + 14 : 18)
    const tabRight = textX + measure(spec.label, labelSize, 'display') + 18
    const subW = Math.max(0, ...subLines.map((s) => measure(s, subSize, 'display')))

    // The event line after the tab: name, OG chip, minute. The name gives way (maxWidth) before the caption passes the limit.
    const chipW = tone === 'ownGoal' ? measure('OG', 28, 'mono') + 2 * 10 : 0
    const minuteW = spec.minute ? measure(spec.minute, minuteSize, 'mono') : 0
    const nameFull = spec.person ? measure(spec.person, nameSize, 'display') : 0
    const fixed = (chipW ? gap + chipW : 0) + (minuteW ? gap + minuteW : 0)
    const nameX = tabRight + pad
    const nameW = Math.max(0, Math.min(nameFull, CAPTION_MAX_RIGHT - pad - nameX - fixed))
    const hasLine = !!(spec.person || spec.minute || chipW)
    let cursor = nameX + (spec.person ? nameW : 0)
    const lineRight = hasLine ? cursor + fixed + pad : tabRight + 8
    const right = Math.min(CAPTION_MAX_RIGHT, Math.max(bug?.right ?? 0, lineRight, textX + subW + pad, tabRight + 8))

    const cy = top + EVENT_H / 2
    const event: Shape[] = [
        { kind: 'rect', x: BUG_X, y: top, w: right - BUG_X, h, r: 14, fill: T.sky, ...rim },
        { kind: 'rect', x: tabX, y: cy - tabH / 2, w: tabRight - tabX, h: tabH, r: 10, fill: T.yellow },
    ]
    if (stripeW) event.push({ kind: 'stripes', x: tabX, y: cy - tabH / 2, w: stripeW, h: tabH, r: 10, sw: 9 })
    event.push(txt(spec.label, textX, cy, labelSize, T.navy, 'display', 'left'))
    if (spec.person) event.push(txt(spec.person, nameX, cy, nameSize, T.white, 'display', 'left', { maxWidth: Math.max(40, nameW) }))
    if (chipW) {
        const chipX = hasLine && spec.person ? cursor + gap : nameX
        const chipH = 38
        event.push({ kind: 'rect', x: chipX, y: cy - chipH / 2, w: chipW, h: chipH, r: 8, fill: T.coral })
        event.push(txt('OG', chipX + chipW / 2, cy, 28, T.white, 'mono', 'center'))
        cursor = chipX + chipW
    }
    if (spec.minute) event.push(txt(spec.minute, spec.person || chipW ? cursor + gap : nameX, cy, minuteSize, T.yellow, 'mono', 'left'))
    subLines.forEach((text, i) => {
        event.push(txt(text, textX, top + EVENT_H + NOTE_H * i + NOTE_H / 2 - 6, subSize, T.white, 'display', 'left', { maxWidth: Math.max(80, right - pad - textX) }))
    })
    const m = motion(t, duration)
    return withMotion([...(bug ? bug.ops : []), ...event], m.alpha, m.dx)
}

const REPLAY_H = 66
/** Design-space rows of the REPLAY tag. */
export const REPLAY_ROWS: [number, number] = [SAFE_Y - 8, SAFE_Y + REPLAY_H + 14]

/** "REPLAY 0.5×" tag, top right: a yellow pill with navy text, shown instantly for the length of a slowed replay. */
export function replayTagLayout(t: number, duration: number, measure: MeasureText = estimateTextWidth, speed = 0.5): DrawOp[] {
    const size = 42
    const text = `REPLAY ${formatSpeed(speed)}`
    const pad = 30
    // Wide enough for the text in whatever font is in use (a fallback face is wider than the real one).
    const w = Math.max(200, measure(text, size, 'display') + 2 * pad)
    const x = DESIGN_W - SAFE_X - w - RIM / 2
    const cy = SAFE_Y + REPLAY_H / 2
    // Appears and disappears instantly (no fade or slide), unlike the captions.
    void t
    void duration
    const ops: Shape[] = [
        { kind: 'rect', x, y: SAFE_Y, w, h: REPLAY_H, r: REPLAY_H / 2, fill: T.yellow, ...rim },
        txt(text, x + w / 2, cy, size, T.navy, 'display', 'center'),
    ]
    return ops.map((o) => ({ ...o, alpha: 1 }))
}
