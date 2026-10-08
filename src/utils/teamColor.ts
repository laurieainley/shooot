/** Team colour value for a kit with no single colour (stored as this string; painted as stripes). */
export const MULTI_COLOR = 'multi'

/** The stripe colours of the multicolour kit; graphics paint the same ones. */
export const MULTI_STRIPES = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#f1fa8c'] as const

const STRIPE = 100 / MULTI_STRIPES.length
const MULTI_BACKGROUND = `linear-gradient(135deg, ${MULTI_STRIPES.map((c, i) => `${c} ${i * STRIPE}% ${(i + 1) * STRIPE}%`).join(', ')})`

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
