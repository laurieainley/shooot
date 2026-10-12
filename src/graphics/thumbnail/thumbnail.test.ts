import { describe, it, expect } from 'vitest'
import { THEMES } from '../themes'
import { BADGE_ZONE, opBounds, tagText } from './compose'
import { thumbnailLayoutFor } from './registry'
import { THUMB_H, THUMB_W, type Measure, type ThumbOp, type ThumbSpec } from './types'

const measure: Measure = (text, _f, size) => text.length * size * 0.58
const base: ThumbSpec = { kind: 'highlights', team1: 'Whites', team2: 'Colours', title: 'Matchday 3', hasLogo: true }
const texts = (ops: ThumbOp[]): string[] => ops.flatMap((o) => (o.kind === 'text' ? [o.text] : []))
const intersects = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

describe.each(THEMES.map((t) => t.id))('thumbnail layout (%s)', (id) => {
    const layout = thumbnailLayoutFor(id)

    it('should say the video kind top right and the teams, and never a score', () => {
        for (const kind of ['highlights', 'fullMatch'] as const) {
            const ops = layout({ ...base, kind }, measure)
            const all = texts(ops)
            expect(all).toContain(tagText(kind))
            expect(all.join(' ')).toContain('WHITES')
            expect(all.join(' ')).toContain('COLOURS')
            expect(all.join(' ')).not.toMatch(/\d\s*[-–:]\s*\d/)
            const tag = ops.find((o) => o.kind === 'text' && o.text === tagText(kind))!
            const b = opBounds(tag, measure)!
            expect(b.x + b.w).toBeGreaterThan(THUMB_W - 300)
            expect(b.y).toBeLessThan(120)
        }
    })

    it('should use a custom headline instead of the team line, wrap it when long, and never show a score', () => {
        const short = layout({ ...base, headline: 'Cup final' }, measure)
        expect(texts(short).join(' ')).toContain('CUP FINAL')
        expect(texts(short).join(' ')).not.toContain('WHITES')
        const long = layout({ ...base, headline: 'The one where Dave scored from the halfway line again' }, measure)
        for (const op of long) {
            const b = opBounds(op, measure)
            if (!b) continue
            expect(intersects(b, BADGE_ZONE)).toBe(false)
            expect(b.x + b.w).toBeLessThanOrEqual(THUMB_W)
            expect(b.y).toBeGreaterThanOrEqual(0)
        }
        expect(texts(layout({ ...base, headline: '   ' }, measure)).join(' ')).toContain('WHITES')
    })

    it('should keep everything out of the bottom-right corner and inside the frame', () => {
        for (const spec of [base, { ...base, team1: 'The Mighty Wanderers United', team2: 'Brothers In Arms Athletic Club' }, { ...base, title: 'A very long matchday title indeed' }]) {
            const ops = layout(spec, measure)
            for (const op of ops) {
                const b = opBounds(op, measure)
                if (!b) continue
                expect(intersects(b, BADGE_ZONE)).toBe(false)
                expect(b.x).toBeGreaterThanOrEqual(0)
                expect(b.x + b.w).toBeLessThanOrEqual(THUMB_W)
                expect(b.y + b.h).toBeLessThanOrEqual(THUMB_H)
            }
        }
    })

    it('should stack long names on two lines and keep every text at a readable size', () => {
        const ops = layout({ ...base, team1: 'The Mighty Wanderers United', team2: 'Brothers In Arms Athletic Club' }, measure)
        const names = ops.filter((o) => o.kind === 'text' && o.color !== undefined && o.size >= 50)
        expect(new Set(names.map((o) => (o.kind === 'text' ? o.y : 0))).size).toBeGreaterThan(1)
        for (const o of ops) if (o.kind === 'text') expect(o.size).toBeGreaterThanOrEqual(30)
    })

    it('should show a short title, drop a long one, and skip the logo when there is none', () => {
        expect(texts(layout(base, measure))).toContain('MATCHDAY 3')
        expect(texts(layout({ ...base, title: 'Sunday league cup quarter final replay' }, measure))).not.toContain('SUNDAY LEAGUE CUP QUARTER FINAL REPLAY')
        expect(layout({ ...base, hasLogo: false }, measure).some((o) => o.kind === 'logo')).toBe(false)
        expect(layout(base, measure).some((o) => o.kind === 'logo')).toBe(true)
    })

    it('should fall back to Team 1 / Team 2 for empty names', () => {
        expect(texts(layout({ ...base, team1: '', team2: '' }, measure)).join(' ')).toContain('TEAM 1')
    })
})

describe('thumbnailLayoutFor', () => {
    it('should use the default layout for an unknown theme', () => {
        expect(thumbnailLayoutFor('neon')(base, measure)).toEqual(thumbnailLayoutFor('shooot')(base, measure))
    })
})
