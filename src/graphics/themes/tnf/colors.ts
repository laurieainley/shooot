// The TNF palette: the official yellow shirt on dark plates (the league's sky blue was dropped on 2026-10-15).
// Two candidate palettes; `T` is the one in use. To swap, change `PALETTES.purple` to `PALETTES.charcoal` on the last line.
const SHARED = {
    /** Official shirt yellow: score, accent, GOAL. */
    yellow: '#F5D31A',
    /** Badge stripe orange. */
    orange: '#F1930D',
    /** Text orange-red, for sparing accents. */
    coral: '#EE6A35',
    white: '#FFFFFF',
} as const

export const PALETTES = {
    /** A: dark purple plates, paler purple-grey for secondary text. */
    purple: { ...SHARED, panel: '#35205C', ground: '#21123A', groundLight: '#35205C', muted: '#CFC3E8', pitch: 'rgba(207,195,232,0.16)' },
    /** B: near-black / charcoal plates, light grey for secondary text. */
    charcoal: { ...SHARED, panel: '#222222', ground: '#0E0E0E', groundLight: '#222222', muted: '#C4C4C4', pitch: 'rgba(255,255,255,0.14)' },
} as const

export type TnfPalette = typeof PALETTES.purple | typeof PALETTES.charcoal

export const T: TnfPalette = PALETTES.purple
