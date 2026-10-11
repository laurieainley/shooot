/** Team colour value for a kit with no single colour (stored as this string; painted as stripes). */
export const MULTI_COLOR = 'multi'

/** The stripe colours the in-video graphics paint for the multicolour kit. */
export const MULTI_STRIPES = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#f1fa8c'] as const

/** The UI swatch / dot for the multicolour kit: three bold segments, so it reads as "colours" at 22px. */
export const MULTI_SEGMENTS = ['#e63946', '#f1c40f', '#457b9d'] as const

const SEGMENT = 100 / MULTI_SEGMENTS.length
const MULTI_BACKGROUND = `linear-gradient(135deg, ${MULTI_SEGMENTS.map((c, i) => `${c} ${i * SEGMENT}% ${(i + 1) * SEGMENT}%`).join(', ')})`

export const isMultiColor = (color: string | undefined): boolean => color === MULTI_COLOR

/** CSS `background` for a team dot / swatch: the colour itself, or the stripes for the multicolour kit. */
export function teamBackground(color: string | undefined, fallback = 'var(--sh-muted)'): string {
    if (isMultiColor(color)) return MULTI_BACKGROUND
    return color || fallback
}

/** A plain CSS colour for places that cannot show stripes (borders, text): `multi` becomes `fallback`. */
export function solidTeamColor(color: string | undefined, fallback: string): string {
    return !color || isMultiColor(color) ? fallback : color
}
