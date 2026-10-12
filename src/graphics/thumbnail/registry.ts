import { DEFAULT_THEME_ID, getTheme } from '../themes'
import { classicThumbnail } from '../themes/classic/thumbnail'
import { shoootThumbnail } from '../themes/shooot/thumbnail'
import { tnfThumbnail } from '../themes/tnf/thumbnail'
import type { ThemeId } from '../themes/types'
import type { ThumbLayout } from './types'

const LAYOUTS: Record<ThemeId, ThumbLayout> = { shooot: shoootThumbnail, classic: classicThumbnail, tnf: tnfThumbnail }

/** The thumbnail layout of the theme with this id (unknown ids get the default theme's, like the rest of the graphics). */
export function thumbnailLayoutFor(id: unknown): ThumbLayout {
    return LAYOUTS[getTheme(id).id] ?? LAYOUTS[DEFAULT_THEME_ID]
}
