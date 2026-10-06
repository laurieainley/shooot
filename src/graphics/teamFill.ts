// Team colours as the graphics paint them: a solid colour, or for 'multi' (the multicolour swatch) diagonal stripes.
export const MULTI = 'multi'
/** Bright, distinct stripes: red, orange, teal, blue, yellow. */
export const MULTI_COLOURS: readonly string[] = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#f1fa8c']
/** Dark outline for initials drawn white over the stripes. */
export const MULTI_OUTLINE = '#0b1730'

export type TeamFill = { kind: 'solid'; color: string } | { kind: 'stripes'; colors: readonly string[] }

export function teamFill(color: string): TeamFill {
    return color === MULTI ? { kind: 'stripes', colors: MULTI_COLOURS } : { kind: 'solid', color }
}

export type Box = { x: number; y: number; w: number; h: number }
export type Band = { color: string; points: [number, number][] }

/** Slanted ("/") bands that cover `box` (clip to the shape before drawing them); colours repeat in order. */
export function stripeBands(box: Box, colors: readonly string[]): Band[] {
    const { x, y, w, h } = box
    // About one colour set across the shorter side, never thinner than 6 px.
    const d = Math.max(6, Math.min(w, h) / colors.length)
    const bands: Band[] = []
    for (let n = 0, u = -h - d; u < w; n++, u += d) {
        bands.push({
            color: colors[n % colors.length],
            points: [[x + u, y + h], [x + u + d, y + h], [x + u + d + h, y], [x + u + h, y]],
        })
    }
    return bands
}
