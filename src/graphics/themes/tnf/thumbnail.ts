import { composeThumbnail, type ThumbStyle } from '../../thumbnail/compose'
import type { ThumbLayout } from '../../thumbnail/types'
import { T } from './colors'
import { fontCss } from './fonts'

/** TNF: Shooot's leaning, sharp-cornered plates in navy with a shirt-yellow tag, Barlow Condensed italic. */
export const TNF_THUMB_STYLE: ThumbStyle = {
    tagFont: (s) => fontCss('display', s),
    nameFont: (s) => fontCss('display', s),
    ink: T.white, accent: T.yellow, onAccent: T.navy,
    plate: T.navy, plateAlpha: 0.92, radius: 0, skew: true, scale: 1,
}

export const tnfThumbnail: ThumbLayout = (spec, measure) => composeThumbnail(spec, measure, TNF_THUMB_STYLE)
