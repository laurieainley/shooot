// Brand colours for the rendered graphics, from the pack's tokens (video is always the dark theme).
import tokens from '../../../../brand/shooot/tokens.json'

const dark = tokens.color.dark
export const C = {
    lime: tokens.color.brand.lime,
    onLime: tokens.color.brand.onLime,
    rec: tokens.color.brand.rec,
    ground: dark.ground,
    surface: dark.surface,
    surface2: dark.surface2,
    line: dark.line,
    pitch: dark.pitch,
    /** Chalk: the text colour on dark. */
    text: dark.text,
    muted: dark.muted,
} as const

/** skewX(-10deg) as a shear factor: x moves by -SKEW × (y - pivot), so tops lean right. */
export const SKEW = Math.tan((10 * Math.PI) / 180)
