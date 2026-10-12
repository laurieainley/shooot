import { composeThumbnail, type ThumbStyle } from '../../thumbnail/compose'
import type { ThumbLayout } from '../../thumbnail/types'
import { NAVY, ORANGE } from './layout'

/** Classic: white Bebas Neue on a navy plate, orange tag. */
export const CLASSIC_THUMB_STYLE: ThumbStyle = {
    tagFont: (s) => `${s}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`,
    nameFont: (s) => `${s}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`,
    ink: '#ffffff', accent: ORANGE, onAccent: NAVY,
    plate: NAVY, plateAlpha: 0.9, radius: 4, skew: false, scale: 1.3,
}

export const classicThumbnail: ThumbLayout = (spec, measure) => composeThumbnail(spec, measure, CLASSIC_THUMB_STYLE)
