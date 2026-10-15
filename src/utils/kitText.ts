import { isMultiColor } from './teamColor'

export interface KitText { fill: string; stroke?: string }

const DARK = '#111111'
const LIGHT = '#ffffff'

function luminance(hex: string): number | null {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return null
    const n = parseInt(m[1], 16)
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG contrast ratio of two #rrggbb colours (1 when either is not one). */
export function contrastRatio(a: string, b: string): number {
    const la = luminance(a)
    const lb = luminance(b)
    if (la === null || lb === null) return 1
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
}

/** Text colour for letters printed on a kit: black or white, whichever reads better; the multicolour kit gets dark text with a light outline. */
export function kitTextColor(color: string | undefined): KitText {
    if (isMultiColor(color)) return { fill: DARK, stroke: LIGHT }
    const l = color ? luminance(color) : null
    if (l === null) return { fill: DARK }
    return contrastRatio(DARK, color as string) >= contrastRatio(LIGHT, color as string) ? { fill: DARK } : { fill: LIGHT }
}
