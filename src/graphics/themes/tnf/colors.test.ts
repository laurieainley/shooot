import { describe, expect, it } from 'vitest'
import { PALETTES, T } from './colors'

const lin = (v: number): number => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
function lum(hex: string): number {
    const n = parseInt(hex.slice(1), 16)
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
const ratio = (a: string, b: string): number => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

describe('TNF palettes', () => {
    for (const [name, p] of Object.entries(PALETTES)) {
        it(`should keep text at 4.5:1 or better on every plate (${name})`, () => {
            for (const plate of [p.panel, p.ground, p.groundLight]) {
                for (const ink of [p.white, p.muted, p.yellow]) expect(ratio(ink, plate), `${ink} on ${plate}`).toBeGreaterThanOrEqual(4.5)
            }
            expect(ratio(p.ground, p.yellow)).toBeGreaterThanOrEqual(4.5)
        })
    }
    it('should not use the league sky blue any more', () => {
        expect(JSON.stringify(T).toLowerCase()).not.toContain('33a0d9')
    })
})
