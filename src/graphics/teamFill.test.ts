import { describe, it, expect } from 'vitest'
import { MULTI_COLOURS, stripeBands, teamFill } from './teamFill'
import { inkFor, teamBadge, WHITE } from './teamStyle'

describe('teamFill', () => {
    it('should be a solid fill for a normal colour', () => {
        expect(teamFill('#ec5fa4')).toEqual({ kind: 'solid', color: '#ec5fa4' })
    })

    it('should be diagonal stripes of 4-5 bright colours for multi', () => {
        const f = teamFill('multi')
        expect(f.kind).toBe('stripes')
        if (f.kind === 'stripes') {
            expect(f.colors).toBe(MULTI_COLOURS)
            expect(f.colors.length).toBeGreaterThanOrEqual(4)
            expect(f.colors.length).toBeLessThanOrEqual(5)
        }
    })
})

describe('stripeBands', () => {
    const box = { x: 100, y: 50, w: 200, h: 120 }
    const bands = stripeBands(box, MULTI_COLOURS)

    it('should cycle through the colours in order', () => {
        expect(bands.slice(0, 7).map((b) => b.color)).toEqual([...MULTI_COLOURS, ...MULTI_COLOURS].slice(0, 7))
    })

    it('should cover the whole box with slanted bands', () => {
        const xs = bands.flatMap((b) => b.points.map((p) => p[0]))
        expect(Math.min(...xs)).toBeLessThanOrEqual(box.x)
        expect(Math.max(...xs)).toBeGreaterThanOrEqual(box.x + box.w)
        for (const b of bands) {
            expect(b.points).toHaveLength(4)
            // slanted: the top edge is shifted right of the bottom edge by the box height
            expect(b.points[3][0] - b.points[0][0]).toBeCloseTo(box.h)
        }
    })
})

describe('multi in team badges', () => {
    it('should use white initials on a multi shield', () => {
        expect(inkFor('multi')).toBe(WHITE)
        expect(teamBadge({ name: 'Mixed', color: 'multi', roster: [] }).colour).toBe('multi')
    })
})
