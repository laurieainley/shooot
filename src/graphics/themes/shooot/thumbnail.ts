import { composeThumbnail, type ThumbStyle } from '../../thumbnail/compose'
import type { ThumbLayout } from '../../thumbnail/types'
import { C } from './brandColors'
import { fontCss } from './fonts'

/** Shooot: chalk on the dark ground, a lime tag, leaning plates, the stadium and scoreboard voices. */
export const SHOOT_THUMB_STYLE: ThumbStyle = {
    tagFont: (s) => fontCss('stadium', s),
    nameFont: (s) => fontCss('scoreboard', s),
    ink: C.text, accent: C.lime, onAccent: C.onLime,
    plate: C.ground, plateAlpha: 0.88, radius: 6, skew: true, scale: 1,
}

export const shoootThumbnail: ThumbLayout = (spec, measure) => composeThumbnail(spec, measure, SHOOT_THUMB_STYLE)
