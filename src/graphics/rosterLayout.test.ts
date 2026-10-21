import { describe, it, expect } from 'vitest'
import { rosterColumns, rosterLayout } from './rosterLayout'

const names = (n: number): string[] => Array.from({ length: n }, (_, i) => `PLAYER ${i + 1}`)
const opts = { cx: 520, top: 700, step: 52, iconW: 40, gap: 14, colGap: 40, maxHalf: 320, measure: (s: string) => s.length * 20 }

describe('rosterColumns', () => {
    it('should use one column up to 6, two up to 12 and "+N MORE" beyond', () => {
        expect(rosterColumns(names(5)).columns).toHaveLength(1)
        expect(rosterColumns(names(6)).columns).toHaveLength(1)
        expect(rosterColumns(names(8)).columns.map((c) => c.length)).toEqual([4, 4])
        expect(rosterColumns(names(12)).columns.map((c) => c.length)).toEqual([6, 6])
        const many = rosterColumns(names(13))
        expect(many.columns.flat()).toHaveLength(11)
        expect(many.moreCount).toBe(2)
    })
    it('should have no columns for an empty roster', () => {
        expect(rosterColumns([]).columns).toEqual([])
    })
})

describe('rosterLayout', () => {
    it('should left-align the names as a block centred on the team', () => {
        const l = rosterLayout(['AL', 'BEN THOMPSON'], opts)
        expect(new Set(l.items.map((i) => i.nameX)).size).toBe(1)
        expect(new Set(l.items.map((i) => i.iconX)).size).toBe(1)
        const left = l.items[0].iconX
        const right = l.items[0].nameX + l.items[0].maxWidth
        expect((left + right) / 2).toBeCloseTo(520)
    })
    it('should stack rows by the step from the top', () => {
        const l = rosterLayout(names(3), opts)
        expect(l.items.map((i) => i.y)).toEqual([700, 752, 804])
    })
    it('should keep two columns inside the half-width and limit long names', () => {
        const l = rosterLayout(names(10).map((n) => n + ' WITH A VERY LONG SURNAME'), opts)
        expect(Math.min(...l.items.map((i) => i.iconX))).toBeGreaterThanOrEqual(520 - 320)
        expect(Math.max(...l.items.map((i) => i.nameX + i.maxWidth))).toBeLessThanOrEqual(520 + 320 + 0.001)
    })
    it('should add a +N MORE line for more than 12', () => {
        const l = rosterLayout(names(15), opts)
        expect(l.items).toHaveLength(11)
        expect(l.more?.text).toBe('+4 MORE')
    })
})
