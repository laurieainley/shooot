import { describe, it, expect } from 'vitest'
import { cardFade, cardLayout, lowerThirdLayout, replayTagLayout, estimateTextWidth, LOWER_THIRD_SEC, type DrawOp, type TextOp } from './layout'
import { NAVY, ORANGE } from './teamStyle'
import type { CardSpec, LowerThirdSpec } from './types'

const left = { name: "RYAN'S ROVERS", initials: 'RR', colour: '#f0f0f0', ink: NAVY }
const right = { name: 'WALFORD TOWN', initials: 'WT', colour: '#ec5fa4', ink: '#ffffff' }
const vs: CardSpec = { heading: 'MATCHDAY 1', centre: 'VS', left, right }
const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.kind === 'text')
const textOf = (ops: DrawOp[]): string[] => texts(ops).map((o) => o.text)

describe('cardLayout', () => {
    it('should draw heading, centre, initials and names', () => {
        const ops = cardLayout(vs, 2, 4, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['MATCHDAY 1', 'VS', 'RR', 'WT', "RYAN'S ROVERS", 'WALFORD TOWN']))
        expect(texts(ops).find((o) => o.text === 'MATCHDAY 1')?.color).toBe(ORANGE)
    })

    it('should put each team on its own side with its colours', () => {
        const ops = cardLayout(vs, 2, 4, true)
        const shields = ops.filter((o) => o.kind === 'shield')
        expect(shields.map((s) => s.kind === 'shield' && [s.cx < 960, s.fill])).toEqual([[true, '#f0f0f0'], [false, '#ec5fa4']])
        expect(texts(ops).find((o) => o.text === 'RR')?.color).toBe(NAVY)
        expect(texts(ops).find((o) => o.text === 'WT')?.color).toBe('#ffffff')
    })

    it('should show the score as "2 - 3" style centre text on the full-time card', () => {
        const ops = cardLayout({ ...vs, heading: 'FULL TIME', centre: '2 - 3' }, 2, 4, true)
        expect(textOf(ops)).toContain('2 - 3')
        expect(textOf(ops)).toContain('FULL TIME')
    })

    it('should give long team names a width limit inside their half', () => {
        const ops = cardLayout({ ...vs, left: { ...left, name: 'ATHLETIC CLUB OF THE NORTHERN TERRITORIES' } }, 2, 4, true)
        const name = texts(ops).find((o) => o.text.startsWith('ATHLETIC'))!
        expect(name.maxWidth).toBeDefined()
        expect(name.x - name.maxWidth! / 2).toBeGreaterThanOrEqual(96)
        expect(name.x + name.maxWidth! / 2).toBeLessThanOrEqual(960)
    })

    it('should include the logo only when there is one', () => {
        expect(cardLayout(vs, 2, 4, true).some((o) => o.kind === 'logo')).toBe(true)
        expect(cardLayout(vs, 2, 4, false).some((o) => o.kind === 'logo')).toBe(false)
    })

    it('should fade from and to black', () => {
        const black = (t: number): number => {
            const f = cardLayout(vs, t, 4, true).find((o) => o.kind === 'rect' && o.fill === '#000000')
            return f && f.kind === 'rect' ? f.alpha ?? 1 : 0
        }
        expect(black(0)).toBeCloseTo(1)
        expect(black(2)).toBe(0)
        expect(black(3.99)).toBeGreaterThan(0.9)
        expect(black(0.25)).toBeCloseTo(0.5, 1)
    })
})

describe('cardFade', () => {
    it('should fade in and out over half a second', () => {
        expect(cardFade(0, 4)).toBe(0)
        expect(cardFade(0.25, 4)).toBeCloseTo(0.5)
        expect(cardFade(2, 4)).toBe(1)
        expect(cardFade(4, 4)).toBe(0)
    })
})

describe('lowerThirdLayout', () => {
    const goal: LowerThirdSpec = { label: 'GOAL', person: 'SAM', stripe: '#f0f0f0', score: { left: 'RR', right: 'WT', text: '1–0' } }
    const alphaAt = (spec: LowerThirdSpec, t: number): number => Math.max(...lowerThirdLayout(spec, t, true).map((o) => (o.kind === 'cardBackground' ? 1 : o.alpha ?? 1)))

    it('should show label, person and the score after a goal', () => {
        const ops = lowerThirdLayout(goal, 1.5, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['GOAL', 'SAM', 'RR', '1–0', 'WT']))
    })

    it('should leave the score out for events that do not score', () => {
        const ops = lowerThirdLayout({ label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING', stripe: ORANGE }, 1.5, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['HIGHLIGHT', 'JO', 'NUTMEG ON THE WING']))
        expect(textOf(ops)).not.toContain('1–0')
    })

    it('should size the panel from the measured text', () => {
        const panelW = (m?: (t: string, s: number) => number): number => {
            const ops = lowerThirdLayout({ label: 'HIGHLIGHT', person: 'JOSEPHINE BLOGGS', stripe: ORANGE }, 1.5, false, LOWER_THIRD_SEC, m)
            const panel = ops.filter((o) => o.kind === 'rect')[1]
            return panel.kind === 'rect' ? panel.w : 0
        }
        expect(panelW((t, size) => t.length * size * 0.3)).toBeLessThan(panelW())
    })

    it('should use the team colour for the stripe', () => {
        expect(lowerThirdLayout(goal, 1.5, true).some((o) => o.kind === 'rect' && o.fill === '#f0f0f0')).toBe(true)
    })

    it('should stay inside the title-safe area', () => {
        const ops = lowerThirdLayout({ ...goal, note: 'A VERY LONG NOTE ABOUT A WONDERFUL PIECE OF SKILL THAT GOES ON AND ON AND ON' }, 1.5, true)
        for (const o of ops) {
            if (o.kind === 'rect') {
                expect(o.x).toBeGreaterThanOrEqual(96)
                expect(o.x + o.w).toBeLessThanOrEqual(1824)
                expect(o.y + o.h).toBeLessThanOrEqual(1026)
            }
            if (o.kind === 'text' && o.align === 'left') expect(o.x + (o.maxWidth ?? estimateTextWidth(o.text, o.size))).toBeLessThanOrEqual(1824)
        }
    })

    it('should fade and slide in over 0.3 s and out over the last 0.3 s', () => {
        expect(alphaAt(goal, 0)).toBe(0)
        expect(alphaAt(goal, 0.15)).toBeGreaterThan(0)
        expect(alphaAt(goal, 0.15)).toBeLessThan(1)
        expect(alphaAt(goal, 1.5)).toBe(1)
        expect(alphaAt(goal, LOWER_THIRD_SEC)).toBe(0)
        const x = (t: number): number => Math.min(...lowerThirdLayout(goal, t, true).filter((o) => o.kind === 'rect').map((o) => (o.kind === 'rect' ? o.x : 0)))
        expect(x(0.1)).toBeLessThan(x(1.5))
    })
})

describe('replayTagLayout', () => {
    it('should draw a REPLAY tag in the top-right safe area', () => {
        const ops = replayTagLayout(1, 6)
        expect(textOf(ops)).toEqual(['REPLAY'])
        const box = ops.find((o) => o.kind === 'rect')!
        expect(box.kind === 'rect' && box.x + box.w).toBeLessThanOrEqual(1824)
        expect(box.kind === 'rect' && box.y).toBeGreaterThanOrEqual(54)
    })
})
