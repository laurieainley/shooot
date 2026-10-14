// TNF graphics: the Shooot theme's geometry (angular plates leaning -10°, the same layout structure and proportions)
// in the league palette: shirt yellow on dark purple plates (colors.ts), orange / white stripes. The fonts are swapped in
// at paint time (paint.ts); here the shared draw ops are recoloured and the badge stripe motif is added to the cards.
import type { BugSpec, CaptionSpec, CardSpec } from '../../types'
import { C } from '../shooot/brandColors'
import * as base from '../shooot/layout'
import type { DrawOp, MeasureText } from '../shooot/layout'
import { T } from './colors'

export { BUG_ROWS, CAPTION_DELAY_SEC, CAPTION_ROWS, CAPTION_SEC, CARD_SEC, DESIGN_H, DESIGN_W, REPLAY_ROWS, SAFE_X, SAFE_Y, cardFade, estimateTextWidth } from '../shooot/layout'
export type { DrawOp, MeasureText, PolyOp, RectOp, TextOp } from '../shooot/layout'

/** Shooot colour -> TNF colour. Anything else (kit colours, black fades) passes through. */
const PALETTE: Record<string, string> = {
    [C.lime]: T.yellow,
    [C.onLime]: T.ground,
    [C.ground]: T.ground,
    [C.surface]: T.panel,
    [C.surface2]: T.panel,
    [C.text]: T.white,
    [C.muted]: T.muted,
    [C.rec]: T.orange,
}
const tone = (c: string): string => PALETTE[c] ?? c

function recolour(o: DrawOp): DrawOp {
    switch (o.kind) {
        case 'rect':
        case 'poly':
        case 'circle': return { ...o, fill: tone(o.fill), ...('stroke' in o && o.stroke ? { stroke: tone(o.stroke) } : {}) }
        case 'text': return { ...o, color: tone(o.color) }
        default: return o
    }
}
const recoloured = (ops: DrawOp[]): DrawOp[] => ops.map(recolour)

const STRIPE_W = 44
const STRIPE_Y = 1036
const STRIPE_H = 18

/** The badge's orange / white stripes as a band of leaning bars along the foot of a card. */
function stripeBand(): DrawOp[] {
    const ops: DrawOp[] = []
    const pivot = STRIPE_Y + STRIPE_H / 2
    for (let i = -1, x = 0; x < base.DESIGN_W + 2 * STRIPE_W; i++, x += STRIPE_W) {
        ops.push({ kind: 'rect', x: x - STRIPE_W, y: STRIPE_Y, w: STRIPE_W, h: STRIPE_H, fill: i % 2 === 0 ? T.orange : T.white, skew: pivot })
    }
    return ops
}

export function cardLayout(spec: CardSpec, t: number, duration: number, hasLogo: boolean, measure: MeasureText = base.estimateTextWidth): DrawOp[] {
    const ops = recoloured(base.cardLayout(spec, t, duration, hasLogo, measure))
    const at = ops.findIndex((o) => o.kind === 'pitch')
    ops.splice(at + 1, 0, ...stripeBand())
    return ops
}

export function scoreBugLayout(bug: BugSpec, t: number, duration: number, hasLogo: boolean, fade: boolean | { in: boolean; out: boolean }, measure: MeasureText = base.estimateTextWidth): DrawOp[] {
    return recoloured(base.scoreBugLayout(bug, t, duration, hasLogo, fade, measure))
}

export function captionLayout(spec: CaptionSpec, t: number, hasLogo: boolean, duration = base.CAPTION_SEC, measure: MeasureText = base.estimateTextWidth): DrawOp[] {
    return recoloured(base.captionLayout(spec, t, hasLogo, duration, measure))
}

export function replayTagLayout(t: number, duration: number, measure: MeasureText = base.estimateTextWidth): DrawOp[] {
    return recoloured(base.replayTagLayout(t, duration, measure))
}
