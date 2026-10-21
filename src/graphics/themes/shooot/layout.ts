// Match graphics as draw-op lists in a 1920×1080 design space (paint.ts scales them to the output size).
// Visual language: the Shooot brand (BRAND.md "In-reel graphics"): near-black ground, lime accents, kit colours as
// bars and fields, tags and bugs leaning -10°. Voices: stadium (loud words), scoreboard (team names), shirt (players), mono (clocks).
import { C, SKEW } from './brandColors'
import type { FontVoice } from './fonts'
import type { Box } from '../../paint'
import { MULTI_OUTLINE } from '../../teamFill'
import { INK_DARK, WHITE, inkFor } from '../../teamStyle'
import { rosterLayout } from '../../rosterLayout'
import type { BugSpec, CaptionSpec, CardSpec, ScorerLine } from '../../types'
import { PRODUCT_NAME } from '../../../brand'

import { CAPTION_DELAY_SEC, CAPTION_SEC, CARD_SEC, DESIGN_H, DESIGN_W, OVERLAY_FADE, SAFE_X, SAFE_Y, cardFade, clamp01, easeOut } from '../../layout'
export { CAPTION_DELAY_SEC, CAPTION_SEC, CARD_SEC, DESIGN_H, DESIGN_W, SAFE_X, SAFE_Y, cardFade }

type Alpha = { alpha?: number }
/** `skew`: the y of the pivot line of a -10° lean (the shape keeps its x there; above it leans right, below it left). */
type Lean = { skew?: number }
export type RectOp = { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string } & Alpha & Lean
export type TextOp = {
    kind: 'text'; text: string; x: number; y: number; size: number; color: string; voice: FontVoice
    align: 'left' | 'center' | 'right'; baseline: 'alphabetic' | 'middle'; maxWidth?: number
    /** Dark outline drawn under the text (white initials over a multicolour field). */
    outline?: string
} & Alpha & Lean
/** A filled polygon (the split kit-colour field); 'multi' fills with stripes over its bounding box. */
export type PolyOp = { kind: 'poly'; points: [number, number][]; fill: string; stroke?: string; lineWidth?: number } & Alpha
/** `keepColour`: a theme's recolouring leaves it alone (the REC dot is always record red). */
export type CircleOp = { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; lineWidth?: number; keepColour?: boolean } & Alpha
/** The league logo, `h` tall, width from its aspect ratio; x is its centre (`center`) or left edge. */
export type LogoOp = { kind: 'logo'; x: number; y: number; h: number; align: 'center' | 'left'; box?: Box } & Alpha & Lean
export type BackgroundOp = { kind: 'cardBackground' } & Alpha
/** Faint pitch markings over the whole design space. */
export type PitchOp = { kind: 'pitch' } & Alpha
export type DrawOp = RectOp | TextOp | PolyOp | CircleOp | LogoOp | BackgroundOp | PitchOp
/** Ops that take part in slide-in motion and alpha (everything except the card backdrops). */
type Shape = Exclude<DrawOp, BackgroundOp | PitchOp>

/** Text width in design pixels; the painter supplies real font metrics, tests use the estimate. */
export type MeasureText = (text: string, size: number, voice?: FontVoice) => number

const EM_WIDTH: Record<FontVoice, number> = { stadium: 0.86, heading: 0.62, scoreboard: 0.5, shirt: 0.47, mono: 0.6 }
/** Rough advance width of upper-case text in a voice (the stadium voice is wide, the shirt voice is narrow). */
export function estimateTextWidth(text: string, size: number, voice: FontVoice = 'shirt'): number {
    return text.length * size * EM_WIDTH[voice]
}

/** How far a -10° lean of a shape `h` tall moves its top / bottom edge sideways from the pivot (centre). */
export const leanShift = (h: number): number => Math.ceil((SKEW * h) / 2)

/** Leans a shape about the pivot row `pivotY`. */
const lean = (o: Shape, pivotY: number): Shape => (o.kind === 'poly' || o.kind === 'circle' ? o : { ...o, skew: pivotY })

/** A -10° leaning lime tag with on-lime text in the stadium voice, centred on (cx, cy). */
function limeTag(text: string, cx: number, cy: number, size: number, maxWidth: number, measure: MeasureText): DrawOp[] {
    const h = Math.round(size * 1.7)
    const w = Math.min(maxWidth, measure(text, size, 'stadium') + size * 1.6)
    return [
        { kind: 'rect', x: cx - w / 2, y: cy - h / 2, w, h, fill: C.lime, skew: cy },
        { kind: 'text', text, x: cx, y: cy, size, color: C.onLime, voice: 'stadium', align: 'center', baseline: 'middle', maxWidth: w - size, skew: cy },
    ]
}

/** The split field of the VS card: left colour | right colour along a line leaning like the tags. */
function splitField(left: string, right: string): DrawOp[] {
    const s = SKEW * (DESIGN_H / 2)
    const mid = DESIGN_W / 2
    return [
        { kind: 'poly', fill: left, points: [[0, 0], [mid + s, 0], [mid - s, DESIGN_H], [0, DESIGN_H]] },
        { kind: 'poly', fill: right, points: [[mid + s, 0], [DESIGN_W, 0], [DESIGN_W, DESIGN_H], [mid - s, DESIGN_H]] },
        // The kit colours sit under a dark wash so chalk text reads on white and yellow kits alike.
        { kind: 'rect', x: 0, y: 0, w: DESIGN_W, h: DESIGN_H, fill: C.ground, alpha: 0.52 },
    ]
}

const initialsOps = (t: CardSpec['left'], cx: number, cy: number, size: number): DrawOp => ({
    kind: 'text', text: t.initials, x: cx, y: cy, size, color: WHITE, voice: 'stadium', align: 'center', baseline: 'middle', maxWidth: 380,
    ...(t.colour === 'multi' ? { outline: MULTI_OUTLINE } : {}),
})

const teamName = (t: CardSpec['left'], cx: number, y: number, size: number): DrawOp => ({
    kind: 'text', text: t.name, x: cx, y, size, color: C.text, voice: 'scoreboard', align: 'center', baseline: 'alphabetic',
    maxWidth: Math.min(720, 2 * Math.min(cx - SAFE_X, 960 - Math.abs(cx - 960)) - 40),
})

const kitBar = (t: CardSpec['left'], cx: number, y: number): DrawOp => ({ kind: 'rect', x: cx - 80, y, w: 160, h: 8, fill: t.colour })

/** The shirt silhouette of components/KitShirt.tsx (24-unit box) as polygon points; the neckline is a short curve. */
const SHIRT: [number, number][] = [
    [8.5, 3.5], [3, 6.2], [4.8, 10.8], [7.5, 9.8], [7.5, 20.5], [16.5, 20.5], [16.5, 9.8], [19.2, 10.8], [21, 6.2], [15.5, 3.5],
    [14.9, 4.7], [13.9, 5.4], [12, 5.7], [10.1, 5.4], [9.1, 4.7],
]
const SHIRT_SCALE = 2.3
const SHIRT_W = 18 * SHIRT_SCALE

/** A small kit-colour shirt with its left edge at `x`, centred on `cy`; light and multicolour kits get a dark outline, dark kits a chalk one. */
function miniShirt(colour: string, x: number, cy: number): DrawOp {
    const light = colour === 'multi' || inkFor(colour) === INK_DARK
    return {
        kind: 'poly', fill: colour, stroke: light ? C.ground : C.text, lineWidth: 3,
        points: SHIRT.map(([px, py]) => [x + (px - 3) * SHIRT_SCALE, cy + (py - 12) * SHIRT_SCALE] as [number, number]),
    }
}

const ROSTER_SIZE = 44
const ROSTER_STEP = 52
const ROSTER_TOP = 700

/** A team's line-up: mini shirt + name (shirt voice), left-aligned columns centred under the team. */
function rosterOps(t: CardSpec['left'], cx: number, measure: MeasureText): DrawOp[] {
    const layout = rosterLayout(t.roster ?? [], {
        cx, top: ROSTER_TOP, step: ROSTER_STEP, iconW: SHIRT_W, gap: 14, colGap: 40, maxHalf: 320,
        measure: (s) => measure(s, ROSTER_SIZE, 'shirt'),
    })
    const ops: DrawOp[] = []
    for (const it of layout.items) {
        ops.push(miniShirt(t.colour, it.iconX, it.y))
        ops.push({ kind: 'text', text: it.name, x: it.nameX, y: it.y, size: ROSTER_SIZE, color: C.text, voice: 'shirt', align: 'left', baseline: 'middle', maxWidth: it.maxWidth })
    }
    if (layout.more) ops.push({ kind: 'text', text: layout.more.text, x: layout.more.x, y: layout.more.y, size: 36, color: C.text, voice: 'mono', align: 'left', baseline: 'middle', maxWidth: layout.more.maxWidth })
    return ops
}

/** Scorer block: from the top of the first row down to the limit above the end line (design px). */
const SCORER_TOP = 668
const SCORER_LIMIT = 968
const SCORER_STEP = 64
/** Step between wrapped minute lines, and the room the minutes column really has (clear of the centre line and the safe area). */
const MINUTE_STEP = 44
const MINUTES_W = 380
const NAME_W = 330
const NAME_SIZE = 54
const MINUTES_SIZE = 40
/** The scorer block shrinks uniformly down to this scale before the "+N MORE" line takes over. */
const SCORER_MIN_SCALE = 0.75
const SCORER_SCALES = [1, 0.95, 0.9, 0.85, 0.8, SCORER_MIN_SCALE]

/** Minutes ("9' 13' 60' PEN") broken into lines of at most `maxWidth`: between minutes, never inside one (a PEN stays with its minute). */
export function wrapMinutes(minutes: string, size: number, maxWidth: number, measure: MeasureText): string[] {
    const units: string[] = []
    for (const tok of minutes.split(/\s+/).filter(Boolean)) {
        if (units.length && !/^\d/.test(tok)) units[units.length - 1] += ` ${tok}`
        else units.push(tok)
    }
    const lines: string[] = []
    for (const u of units) {
        const last = lines.length - 1
        if (last >= 0 && measure(`${lines[last]} ${u}`, size, 'mono') <= maxWidth) lines[last] += ` ${u}`
        else lines.push(u)
    }
    return lines.length ? lines : ['']
}

type ScorerRow = { line: ScorerLine; minuteLines: string[] }
const rowHeight = (r: ScorerRow, s: number): number => (SCORER_STEP + (r.minuteLines.length - 1) * MINUTE_STEP) * s
const MORE_H = 56

function scorerRows(lines: ScorerLine[], s: number, measure: MeasureText): ScorerRow[] {
    return lines.map((line) => ({ line, minuteLines: wrapMinutes(line.minutes, MINUTES_SIZE * s, MINUTES_W, measure) }))
}

/** The scale every column shares: the biggest that fits all scorers above the end line, else the floor. */
function scorerScale(columns: ScorerLine[][], measure: MeasureText): number {
    for (const s of SCORER_SCALES) {
        const fits = columns.every((c) => scorerRows(c, s, measure).reduce((h, r) => h + rowHeight(r, s), 0) <= SCORER_LIMIT - SCORER_TOP)
        if (fits) return s
    }
    return SCORER_MIN_SCALE
}

/**
 * One column of scorers under a team: names (shirt voice) right-aligned to the centre line, minutes (mono) left of it,
 * wrapped onto more lines at full size when they don't fit. The block shrinks as a whole (never squashes), then "+N MORE".
 */
function scorerColumn(lines: ScorerLine[], cx: number, s: number, measure: MeasureText): DrawOp[] {
    const rows = scorerRows(lines, s, measure)
    const room = SCORER_LIMIT - SCORER_TOP
    let used = 0
    let shown = 0
    for (const r of rows) {
        const h = rowHeight(r, s)
        const rest = shown + 1 < rows.length ? MORE_H * s : 0
        if (used + h + rest > room && shown > 0) break
        used += h
        shown++
    }
    const ops: DrawOp[] = []
    let y = SCORER_TOP
    rows.slice(0, shown).forEach((r) => {
        const y0 = y + (SCORER_STEP * s) / 2
        ops.push({ kind: 'text', text: r.line.name, x: cx - 16, y: y0, size: NAME_SIZE * s, color: C.text, voice: 'shirt', align: 'right', baseline: 'middle', maxWidth: NAME_W })
        r.minuteLines.forEach((m, j) => {
            ops.push({ kind: 'text', text: m, x: cx + 16, y: y0 + j * MINUTE_STEP * s, size: MINUTES_SIZE * s, color: C.lime, voice: 'mono', align: 'left', baseline: 'middle', maxWidth: MINUTES_W })
        })
        y += rowHeight(r, s)
    })
    if (shown < rows.length) {
        ops.push({ kind: 'text', text: `+${rows.length - shown} MORE`, x: cx, y: y + (MORE_H * s) / 2, size: MINUTES_SIZE * s, color: C.muted, voice: 'mono', align: 'center', baseline: 'middle', maxWidth: 400 })
    }
    return ops
}

/** Centre of the end line, and the room it keeps clear above the theme's bottom band (TNF stripes start at y 1036). */
export const END_LINE_Y = 990

/** "Made with Shooot ●": small, muted, at the foot of the full-time card. The dot is the real record red in every theme. */
function endLine(measure: MeasureText): DrawOp[] {
    const size = 28
    const text = `Made with ${PRODUCT_NAME}`
    const w = measure(text, size, 'mono')
    const gap = 16
    const dot = 8
    const left = DESIGN_W / 2 - (w + gap + 2 * dot) / 2
    const y = END_LINE_Y
    return [
        { kind: 'text', text, x: left, y, size, color: C.muted, voice: 'mono', align: 'left', baseline: 'middle' },
        { kind: 'circle', cx: left + w + gap + dot, cy: y, r: dot, fill: C.rec, keepColour: true },
    ]
}

/** VS or full-time card at `t` seconds of a `duration`-second card (fades from and to black). */
export function cardLayout(spec: CardSpec, t: number, duration: number, hasLogo: boolean, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const vs = spec.centre === 'VS'
    const ops: DrawOp[] = [{ kind: 'cardBackground' }]
    if (vs) ops.push(...splitField(spec.left.colour, spec.right.colour))
    ops.push({ kind: 'pitch' })
    if (hasLogo) ops.push({ kind: 'logo', x: 960, y: 50, h: 170, align: 'center' })
    if (vs) {
        ops.push(...limeTag(spec.heading, 960, 330, 56, 1300, measure))
        if (spec.left.roster?.length || spec.right.roster?.length) {
            // Line-ups: smaller initials and the team name and kit bar higher up, the lists below.
            ops.push(initialsOps(spec.left, 520, 470, 160), initialsOps(spec.right, 1400, 470, 160))
            ops.push(teamName(spec.left, 520, 610, 80), teamName(spec.right, 1400, 610, 80))
            ops.push(kitBar(spec.left, 520, 628), kitBar(spec.right, 1400, 628))
            ops.push({ kind: 'circle', cx: 960, cy: 520, r: 128, fill: C.lime, stroke: C.ground, lineWidth: 12 })
            ops.push({ kind: 'text', text: spec.centre, x: 960, y: 520, size: 104, color: C.onLime, voice: 'stadium', align: 'center', baseline: 'middle', maxWidth: 200 })
            ops.push(...rosterOps(spec.left, 520, measure), ...rosterOps(spec.right, 1400, measure))
        } else {
            ops.push(initialsOps(spec.left, 520, 590, 250), initialsOps(spec.right, 1400, 590, 250))
            ops.push(teamName(spec.left, 520, 820, 96), teamName(spec.right, 1400, 820, 96))
            ops.push(kitBar(spec.left, 520, 850), kitBar(spec.right, 1400, 850))
            ops.push({ kind: 'circle', cx: 960, cy: 590, r: 128, fill: C.lime, stroke: C.ground, lineWidth: 12 })
            ops.push({ kind: 'text', text: spec.centre, x: 960, y: 590, size: 104, color: C.onLime, voice: 'stadium', align: 'center', baseline: 'middle', maxWidth: 200 })
        }
    } else {
        ops.push(...limeTag(spec.heading, 960, 290, 52, 900, measure))
        ops.push({ kind: 'text', text: spec.centre, x: 960, y: 445, size: 190, color: C.text, voice: 'stadium', align: 'center', baseline: 'middle', maxWidth: 620 })
        ops.push(initialsOps(spec.left, 410, 445, 140), initialsOps(spec.right, 1510, 445, 140))
        ops.push(teamName(spec.left, 520, 620, 72), teamName(spec.right, 1400, 620, 72))
        ops.push(kitBar(spec.left, 520, 640), kitBar(spec.right, 1400, 640))
        if (spec.scorers) {
            const sc = scorerScale([spec.scorers.left, spec.scorers.right], measure)
            ops.push(...scorerColumn(spec.scorers.left, 520, sc, measure), ...scorerColumn(spec.scorers.right, 1400, sc, measure))
        }
        ops.push(...endLine(measure))
    }
    const fade = cardFade(t, duration)
    if (fade < 1) ops.push({ kind: 'rect', x: 0, y: 0, w: DESIGN_W, h: DESIGN_H, fill: '#000000', alpha: 1 - fade })
    return ops
}

function shifted(o: Shape, dx: number): Shape {
    switch (o.kind) {
        case 'poly': return { ...o, points: o.points.map(([x, y]) => [x + dx, y] as [number, number]) }
        case 'circle': return { ...o, cx: o.cx + dx }
        default: return { ...o, x: o.x + dx }
    }
}

const withMotion = (ops: DrawOp[], alpha: number, dx: number): DrawOp[] =>
    ops.map((o) => (o.kind === 'cardBackground' || o.kind === 'pitch' ? o : { ...shifted(o, dx), alpha: (o.alpha ?? 1) * alpha }))

function motion(t: number, duration: number): { alpha: number; dx: number } {
    const p = easeOut(clamp01(Math.min(t / OVERLAY_FADE, (duration - t) / OVERLAY_FADE)))
    return { alpha: p, dx: -60 * (1 - p) }
}

/** Captions, the score bug and the REPLAY tag are drawn 0.84× the original design (1.4×, then 25 % smaller, then another 20 % so they cover less of the frame). */
export const OVERLAY_SCALE = 0.84
const k = (v: number): number => Math.round(v * OVERLAY_SCALE)

const BUG_H = k(64)
const BUG_PAD = k(16)
/** The 5 px kit-colour bars at the outer edges of the score bug. */
const BUG_BAR = 5
const EVENT_H = k(72)
/** The assist / note bands are about 60 % of the event line's text size. */
const NOTE_H = k(46)
const KIT_BAR = k(6)
/** Captions stay left of the REPLAY tag (top right), with room for the lean. */
const CAPTION_MAX_RIGHT = 1360

/** Design-space rows the score bug / a caption can touch (with room for anti-aliasing). */
export const BUG_ROWS: [number, number] = [SAFE_Y - 14, SAFE_Y + BUG_H + 14]
/** Under the event line: an optional assist line, then an optional note, each one NOTE_H band. */
export const CAPTION_ROWS: [number, number] = [SAFE_Y - 14, SAFE_Y + BUG_H + EVENT_H + 2 * NOTE_H + 14]

/** TV-style score bug row from (x0, y): [logo] ▌WH  1–0  CO▐, the score in mono on lime, kit-colour bars at both ends. */
function bugRow(bug: BugSpec, hasLogo: boolean, measure: MeasureText, x0: number, y: number): { ops: Shape[]; right: number } {
    const initialsSize = k(44)
    const scoreSize = k(46)
    const cy = y + BUG_H / 2
    let x = x0
    const ops: Shape[] = []
    if (hasLogo) {
        ops.push({ kind: 'rect', x, y, w: BUG_H, h: BUG_H, fill: C.ground })
        ops.push({ kind: 'logo', x: x + BUG_H / 2, y: y + k(7), h: BUG_H - 2 * k(7), align: 'center', box: { x, y, w: BUG_H, h: BUG_H } })
        x += BUG_H
    }
    const initialsW = Math.max(measure(bug.left, initialsSize, 'scoreboard'), measure(bug.right, initialsSize, 'scoreboard')) + 2 * BUG_PAD
    const scoreW = Math.max(k(80), measure(bug.text, scoreSize, 'mono') + 2 * BUG_PAD)
    const right = x + 2 * BUG_BAR + 2 * initialsW + scoreW
    ops.push({ kind: 'rect', x, y, w: right - x, h: BUG_H, fill: C.surface })
    ops.push({ kind: 'rect', x, y, w: BUG_BAR, h: BUG_H, fill: bug.leftColour })
    ops.push({ kind: 'text', text: bug.left, x: x + BUG_BAR + initialsW / 2, y: cy, size: initialsSize, color: C.text, voice: 'scoreboard', align: 'center', baseline: 'middle' })
    const sx = x + BUG_BAR + initialsW
    ops.push({ kind: 'rect', x: sx, y, w: scoreW, h: BUG_H, fill: C.lime })
    ops.push({ kind: 'text', text: bug.text, x: sx + scoreW / 2, y: cy, size: scoreSize, color: C.onLime, voice: 'mono', align: 'center', baseline: 'middle' })
    ops.push({ kind: 'text', text: bug.right, x: sx + scoreW + initialsW / 2, y: cy, size: initialsSize, color: C.text, voice: 'scoreboard', align: 'center', baseline: 'middle' })
    ops.push({ kind: 'rect', x: right - BUG_BAR, y, w: BUG_BAR, h: BUG_H, fill: bug.rightColour })
    return { ops, right }
}

/** The score bug on its own: still while a window runs through the whole cut, or sliding / fading in and out over 0.3 s when it comes and goes. */
export function scoreBugLayout(bug: BugSpec, t: number, duration: number, hasLogo: boolean, fade: boolean | { in: boolean; out: boolean }, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const pivot = SAFE_Y + BUG_H / 2
    const ops = bugRow(bug, hasLogo, measure, SAFE_X + leanShift(BUG_H), SAFE_Y).ops.map((o) => lean(o, pivot))
    const f = typeof fade === 'boolean' ? { in: fade, out: fade } : fade
    if (!f.in && !f.out) return ops.map((o) => ({ ...o, alpha: 1 }))
    // A window split at a file join keeps going there: no fade at that edge.
    const p = easeOut(clamp01(Math.min(f.in ? t / OVERLAY_FADE : 1, f.out ? (duration - t) / OVERLAY_FADE : 1)))
    return withMotion(ops, p, -60 * (1 - p))
}

/**
 * Event caption, top-left (TV score-bug convention): the score bug row with the event line beneath, all leaning
 * together: a lime slab with the event word (stadium voice), then a black bar with the player's name (shirt voice) and
 * the minute (mono), then smaller `ASSIST: JO` and note lines. 5 s, sliding and fading in and out over 0.3 s.
 */
export function captionLayout(spec: CaptionSpec, t: number, hasLogo: boolean, duration = CAPTION_SEC, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const assistText = spec.assist ? `ASSIST: ${spec.assist}` : undefined
    const subLines = [assistText, spec.note].filter((s): s is string => !!s)
    const bugH = spec.bug ? BUG_H : 0
    const h = EVENT_H + subLines.length * NOTE_H
    const totalH = bugH + h
    const pivot = SAFE_Y + totalH / 2
    const x0 = SAFE_X + leanShift(totalH)
    const bug = spec.bug ? bugRow(spec.bug, hasLogo, measure, x0, SAFE_Y) : null
    const top = SAFE_Y + bugH

    const labelSize = k(54)
    const nameSize = k(58)
    const subSize = k(36)
    const minuteSize = k(34)
    const pad = k(22)
    const gap = k(18)
    const slabPad = k(24)
    const tone = spec.tone ?? 'goal'
    const textX = x0 + KIT_BAR + slabPad
    const slabRight = textX + measure(spec.label, labelSize, 'stadium') + slabPad
    const subW = Math.max(0, ...subLines.map((s) => measure(s, subSize, 'shirt')))

    // The event line after the slab: name, OG chip, minute. The name gives way (maxWidth) before the caption passes the limit.
    const chipW = tone === 'ownGoal' ? measure('OG', k(28), 'mono') + 2 * k(9) : 0
    const minuteW = spec.minute ? measure(spec.minute, minuteSize, 'mono') : 0
    const nameFull = spec.person ? measure(spec.person, nameSize, 'shirt') : 0
    const fixed = (chipW ? gap + chipW : 0) + (minuteW ? gap + minuteW : 0)
    const nameX = slabRight + pad
    const nameW = Math.max(0, Math.min(nameFull, CAPTION_MAX_RIGHT - pad - nameX - fixed))
    const hasLine = !!(spec.person || spec.minute || chipW)
    let cursor = nameX + (spec.person ? nameW : 0)
    const lineRight = hasLine ? cursor + fixed + pad : slabRight
    const right = Math.min(CAPTION_MAX_RIGHT, Math.max(bug?.right ?? 0, lineRight, textX + subW + pad, slabRight))

    const slabFill = tone === 'goal' ? C.lime : tone === 'ownGoal' ? C.text : C.surface2
    const slabInk = tone === 'other' ? C.text : C.onLime
    const cy = top + EVENT_H / 2
    const event: Shape[] = [
        { kind: 'rect', x: x0 + KIT_BAR, y: top, w: right - x0 - KIT_BAR, h, fill: C.ground, alpha: 0.94 },
        { kind: 'rect', x: x0, y: top, w: KIT_BAR, h, fill: spec.stripe },
        { kind: 'rect', x: x0 + KIT_BAR, y: top, w: slabRight - x0 - KIT_BAR, h: EVENT_H, fill: slabFill },
        { kind: 'text', text: spec.label, x: textX, y: cy, size: labelSize, color: slabInk, voice: 'stadium', align: 'left', baseline: 'middle' },
    ]
    if (spec.person) {
        event.push({ kind: 'text', text: spec.person, x: nameX, y: cy, size: nameSize, color: C.text, voice: 'shirt', align: 'left', baseline: 'middle', maxWidth: Math.max(40, nameW) })
    }
    if (chipW) {
        const chipX = hasLine && spec.person ? cursor + gap : nameX
        const chipH = k(36)
        event.push({ kind: 'rect', x: chipX, y: cy - chipH / 2, w: chipW, h: chipH, fill: C.text })
        event.push({ kind: 'text', text: 'OG', x: chipX + chipW / 2, y: cy, size: k(28), color: C.onLime, voice: 'mono', align: 'center', baseline: 'middle' })
        cursor = chipX + chipW
    }
    if (spec.minute) {
        event.push({ kind: 'text', text: spec.minute, x: (spec.person || chipW ? cursor + gap : nameX), y: cy, size: minuteSize, color: C.lime, voice: 'mono', align: 'left', baseline: 'middle' })
    }
    subLines.forEach((text, i) => {
        event.push({ kind: 'text', text, x: textX, y: top + EVENT_H + NOTE_H * i + NOTE_H / 2, size: subSize, color: C.text, voice: 'shirt', align: 'left', baseline: 'middle', maxWidth: Math.max(80, right - pad - textX) })
    })
    const m = motion(t, duration)
    const all = [...(bug ? bug.ops : []), ...event].map((o) => lean(o, pivot))
    return withMotion(all, m.alpha, m.dx)
}

/** Design-space rows of the REPLAY tag. */
export const REPLAY_ROWS: [number, number] = [SAFE_Y - 8, SAFE_Y + k(64) + 14]

/** "REPLAY" tag, top right, shown instantly for the length of a slowed replay (broadcast convention; captions are top left). */
export function replayTagLayout(t: number, duration: number, measure: MeasureText = estimateTextWidth): DrawOp[] {
    const h = k(64)
    const dot = k(9)
    const size = k(46)
    const text = 'REPLAY' // just REPLAY: the speed is visible, not worth spelling out
    const pad = k(18)
    // Wide enough for the text in whatever font is in use (a fallback face is wider than the mono instance).
    const w = Math.max(k(150), pad + 2 * dot + k(12) + measure(text, size, 'mono') + pad)
    const x = DESIGN_W - SAFE_X - w - leanShift(h)
    const y = SAFE_Y
    const cy = y + h / 2
    const pivot = cy
    const ops: Shape[] = [
        { kind: 'rect', x, y, w, h, fill: C.ground },
        { kind: 'circle', cx: x + pad + dot, cy, r: dot, fill: C.rec },
        { kind: 'text', text, x: x + pad + 2 * dot + k(12), y: cy, size, color: C.text, voice: 'mono', align: 'left', baseline: 'middle' },
    ]
    // Appears and disappears instantly (no fade or slide), unlike the captions.
    void t
    void duration
    return ops.map((o) => ({ ...lean(o, pivot), alpha: 1 }))
}
