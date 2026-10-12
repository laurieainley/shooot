import { THUMB_H, THUMB_W, type FontFn, type Measure, type ThumbOp, type ThumbSpec } from './types'

/** What a theme decides about its thumbnail; the arrangement (what goes where) is shared and follows YouTube's rules. */
export type ThumbStyle = {
    tagFont: FontFn
    nameFont: FontFn
    /** Text colour on the dark plate and the shade. */
    ink: string
    /** The "V" between the teams, the title line and the tag plate. */
    accent: string
    /** Text colour on the accent. */
    onAccent: string
    plate: string
    plateAlpha: number
    plateStroke?: string
    radius: number
    skew: boolean
    /** Multiplies the nominal text sizes (condensed faces need more to look as big). */
    scale: number
}

export const MARGIN = 48
/** YouTube draws the duration badge here: nothing may touch it. */
export const BADGE_ZONE = { x: 960, y: 600, w: THUMB_W - 960, h: THUMB_H - 600 }
const NAME_MAX_W = 900
const PLATE_PAD = 24
const TITLE_MAX_CHARS = 24

export const tagText = (kind: ThumbSpec['kind']): string => (kind === 'fullMatch' ? 'FULL MATCH' : 'HIGHLIGHTS')

/** The size (at most `size`, at least `min`) at which `text` fits `maxW`; `min` when it never does. */
export function fitSize(text: string, font: FontFn, size: number, min: number, maxW: number, measure: Measure): number {
    let s = size
    while (s > min && measure(text, font, s) > maxW) s -= 2
    return Math.max(min, s)
}

type Part = { text: string; accent: boolean }

/** Builds the draw ops for one thumbnail in a theme's style. */
export function composeThumbnail(spec: ThumbSpec, measure: Measure, st: ThumbStyle): ThumbOp[] {
    const ops: ThumbOp[] = []
    const k = st.scale
    ops.push({ kind: 'shade', y0: 260, y1: THUMB_H, from: 0, to: 0.8 })
    ops.push({ kind: 'shade', y0: 0, y1: 230, from: 0.5, to: 0 })

    // Kind tag, top right.
    const tagSize = 44 * k
    const tagW = measure(tagText(spec.kind), st.tagFont, tagSize) + 56
    const tagH = 78
    const tagX = THUMB_W - MARGIN - tagW
    ops.push({ kind: 'rect', x: tagX, y: 40, w: tagW, h: tagH, r: st.radius, fill: st.accent, skew: st.skew, stroke: st.plateStroke, lineWidth: st.plateStroke ? 4 : undefined })
    ops.push({ kind: 'text', text: tagText(spec.kind), x: tagX + tagW / 2, y: 40 + tagH / 2, size: tagSize, font: st.tagFont, color: st.onAccent, align: 'center' })

    if (spec.hasLogo) ops.push({ kind: 'logo', x: MARGIN, y: 40, h: 104 })

    // Teams, bottom left, on a plate. One line when it fits at a big size, else stacked.
    const a = spec.team1.trim().toUpperCase() || 'TEAM 1'
    const b = spec.team2.trim().toUpperCase() || 'TEAM 2'
    const textMax = NAME_MAX_W - 2 * PLATE_PAD
    const lineSize = (parts: Part[], size: number): number => {
        const gap = size * 0.3
        return parts.reduce((w, p) => w + measure(p.text, st.nameFont, size), 0) + gap * (parts.length - 1)
    }
    const one: Part[] = [{ text: a, accent: false }, { text: 'V', accent: true }, { text: b, accent: false }]
    const MAX = 132 * k, MIN_ONE = 92 * k
    let size = MAX
    while (size > MIN_ONE && lineSize(one, size) > textMax) size -= 2
    let lines: Part[][]
    if (lineSize(one, size) <= textMax) lines = [one]
    else {
        lines = [[{ text: a, accent: false }], [{ text: 'V', accent: true }, { text: b, accent: false }]]
        size = 112 * k
        while (size > 60 * k && lines.some((l) => lineSize(l, size) > textMax)) size -= 2
    }
    const lineH = size * 1.02
    const blockH = lineH * lines.length + PLATE_PAD * 1.4
    const plateW = Math.min(NAME_MAX_W, Math.max(...lines.map((l) => lineSize(l, size))) + 2 * PLATE_PAD)
    const plateY = THUMB_H - MARGIN - blockH
    ops.push({ kind: 'rect', x: MARGIN, y: plateY, w: plateW, h: blockH, r: st.radius, fill: st.plate, alpha: st.plateAlpha, skew: st.skew, stroke: st.plateStroke, lineWidth: st.plateStroke ? 4 : undefined })
    lines.forEach((parts, li) => {
        const x0 = MARGIN + PLATE_PAD
        let x = x0
        const y = plateY + PLATE_PAD * 0.7 + lineH * (li + 0.5)
        parts.forEach((p) => {
            const room = Math.max(1, x0 + textMax - x)
            const w = Math.min(measure(p.text, st.nameFont, size), room)
            ops.push({ kind: 'text', text: p.text, x, y, size, font: st.nameFont, color: p.accent ? st.accent : st.ink, align: 'left', maxWidth: room })
            x += w + size * 0.3
        })
    })

    // Optional title line above the plate, only when short enough to read at a glance.
    const title = spec.title?.trim().toUpperCase()
    if (title && title.length <= TITLE_MAX_CHARS) {
        const ts = fitSize(title, st.nameFont, 52 * k, 36 * k, NAME_MAX_W, measure)
        ops.push({ kind: 'text', text: title, x: MARGIN + 4, y: plateY - ts * 0.8, size: ts, font: st.nameFont, color: st.accent, align: 'left', maxWidth: NAME_MAX_W })
    }
    return ops
}

/** Bounding box of an op, for layout checks; shades cover the frame and have none. */
export function opBounds(op: ThumbOp, measure: Measure): { x: number; y: number; w: number; h: number } | null {
    switch (op.kind) {
        case 'shade': return null
        case 'rect': return { x: op.x, y: op.y, w: op.w, h: op.h }
        case 'logo': return { x: op.x, y: op.y, w: op.h, h: op.h }
        case 'text': {
            const w = Math.min(op.maxWidth ?? Infinity, measure(op.text, op.font, op.size))
            const x = op.align === 'left' ? op.x : op.align === 'center' ? op.x - w / 2 : op.x - w
            return { x, y: op.y - op.size / 2, w, h: op.size }
        }
    }
}
