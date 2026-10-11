import { describe, it, expect } from 'vitest'
import { BUG_ROWS, CAPTION_ROWS, CAPTION_SEC, REPLAY_ROWS, captionLayout, cardLayout, replayTagLayout, scoreBugLayout, estimateTextWidth, type DrawOp, type RectOp, type TextOp } from './layout'
import { T } from './colors'
import type { BugSpec, CaptionSpec, CardSpec } from '../../types'

const left = { name: "RYAN'S ROVERS", initials: 'RR', colour: '#f0f0f0', ink: '#000' }
const right = { name: 'WALFORD TOWN', initials: 'WT', colour: '#ec5fa4', ink: '#fff' }
const vs: CardSpec = { heading: 'MATCHDAY 1', centre: 'VS', left, right }
const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.kind === 'text')
const rects = (ops: DrawOp[]): RectOp[] => ops.filter((o): o is RectOp => o.kind === 'rect')
const bug: BugSpec = { left: 'RR', right: 'WT', leftColour: '#f0f0f0', rightColour: '#ec5fa4', text: '1–0' }

describe('tnf cardLayout', () => {
    it('should draw heading, names and VS on a yellow plate with navy text', () => {
        const ops = cardLayout(vs, 2, 4, true)
        expect(texts(ops).map((o) => o.text)).toEqual(expect.arrayContaining(['MATCHDAY 1', 'VS', "RYAN'S ROVERS", 'WALFORD TOWN']))
        expect(texts(ops).find((o) => o.text === 'VS')).toMatchObject({ color: T.navy })
        expect(rects(ops).some((r) => r.fill === T.yellow && r.stroke === T.white)).toBe(true)
        expect(texts(ops).find((o) => o.text === 'MATCHDAY 1')?.color).toBe(T.yellow)
    })

    it('should show the score on the full-time card with scorers', () => {
        const scorers = { left: [{ name: 'SAM TAYLOR', minutes: "'13" }], right: [] }
        const ops = cardLayout({ ...vs, heading: 'FULL TIME', centre: '2 - 3', scorers }, 2, 4, true)
        expect(texts(ops).map((o) => o.text)).toEqual(expect.arrayContaining(['2 - 3', 'FULL TIME', 'SAM TAYLOR']))
    })

    it('should keep a long scorers list to five lines', () => {
        const many = Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, minutes: "'1" }))
        const ops = cardLayout({ ...vs, heading: 'FULL TIME', centre: '9 - 0', scorers: { left: many, right: [] } }, 2, 4, false)
        expect(texts(ops).map((o) => o.text)).toContain('+5 MORE')
    })

    it('should include the logo only when there is one', () => {
        expect(cardLayout(vs, 2, 4, true).some((o) => o.kind === 'logo')).toBe(true)
        expect(cardLayout(vs, 2, 4, false).some((o) => o.kind === 'logo')).toBe(false)
    })

    it('should keep long team names inside their plates', () => {
        const ops = cardLayout({ ...vs, left: { ...left, name: 'ATHLETIC CLUB OF THE NORTHERN TERRITORIES' } }, 2, 4, true)
        const name = texts(ops).find((o) => o.text.startsWith('ATHLETIC'))!
        expect(name.maxWidth).toBeDefined()
        expect(name.x - name.maxWidth! / 2).toBeGreaterThanOrEqual(96)
        expect(name.x + name.maxWidth! / 2).toBeLessThanOrEqual(960)
    })

    it('should fade from and to black', () => {
        const black = (t: number): number => rects(cardLayout(vs, t, 4, true)).find((r) => r.fill === '#000000')?.alpha ?? 0
        expect(black(0)).toBeCloseTo(1)
        expect(black(2)).toBe(0)
    })
})

describe('tnf captionLayout', () => {
    const goal: CaptionSpec = { label: 'GOAL!', person: 'SAM', minute: "'34", stripe: '#f0f0f0', bug }

    it('should put the event word on a yellow tab with navy text, striped for goals only', () => {
        const ops = captionLayout(goal, 2.5, true)
        expect(texts(ops).find((o) => o.text === 'GOAL!')).toMatchObject({ color: T.navy })
        expect(ops.some((o) => o.kind === 'stripes')).toBe(true)
        expect(captionLayout({ ...goal, label: 'SAVE', tone: 'other' }, 2.5, true).some((o) => o.kind === 'stripes')).toBe(false)
    })

    it('should stay within its rows, inside title-safe and clear of the REPLAY tag', () => {
        const ops = captionLayout({ ...goal, person: 'MAXIMILIAN ALEXANDER-FOTHERINGHAM THE THIRD', assist: 'JO', note: 'A VERY LONG NOTE ABOUT A WONDERFUL PIECE OF SKILL THAT GOES ON AND ON' }, 2.5, true)
        const tag = rects(replayTagLayout(1, 6))[0]
        for (const o of rects(ops)) {
            expect(o.x).toBeGreaterThanOrEqual(96)
            expect(o.y - 2).toBeGreaterThanOrEqual(CAPTION_ROWS[0])
            expect(o.x + o.w).toBeLessThan(tag.x)
            expect(o.y + o.h + 2).toBeLessThanOrEqual(CAPTION_ROWS[1])
        }
        for (const o of texts(ops)) if (o.align === 'left') expect(o.x + (o.maxWidth ?? estimateTextWidth(o.text, o.size))).toBeLessThan(tag.x)
    })

    it('should leave the bug out without teams, and show OG for own goals', () => {
        expect(texts(captionLayout({ label: 'GOAL!', person: 'SAM', stripe: '#fff' }, 2.5, true)).map((o) => o.text)).toEqual(['GOAL!', 'SAM'])
        expect(texts(captionLayout({ ...goal, tone: 'ownGoal' }, 2.5, false)).map((o) => o.text)).toContain('OG')
    })

    it('should slide and fade over 0.3 s of its 5 s', () => {
        const alpha = (t: number): number => Math.max(...captionLayout(goal, t, true).map((o) => (o.kind === 'cardBackground' ? 1 : o.alpha ?? 1)))
        expect(alpha(0)).toBe(0)
        expect(alpha(2.5)).toBe(1)
        expect(alpha(CAPTION_SEC)).toBe(0)
    })
})

describe('tnf scoreBugLayout', () => {
    it('should show initials either side of the score on a yellow pill within its rows', () => {
        const ops = scoreBugLayout(bug, 1, 10, true, false)
        expect(texts(ops).map((o) => o.text)).toEqual(['RR', '1–0', 'WT'])
        expect(rects(ops).some((r) => r.fill === T.yellow)).toBe(true)
        expect(rects(ops).map((r) => r.fill)).toEqual(expect.arrayContaining(['#f0f0f0', '#ec5fa4']))
        for (const r of rects(ops)) {
            expect(r.y).toBeGreaterThanOrEqual(BUG_ROWS[0])
            expect(r.y + r.h).toBeLessThanOrEqual(BUG_ROWS[1])
        }
        expect(ops.some((o) => o.kind === 'logo')).toBe(true)
        expect(scoreBugLayout(bug, 1, 10, false, false).some((o) => o.kind === 'logo')).toBe(false)
    })
})

describe('tnf replayTagLayout', () => {
    it('should draw a yellow pill with navy REPLAY and the speed, inside title-safe and its rows', () => {
        const ops = replayTagLayout(1, 6, estimateTextWidth, 0.5)
        expect(texts(ops)[0]).toMatchObject({ text: 'REPLAY 0.5×', color: T.navy })
        const pill = rects(ops)[0]
        expect(pill.fill).toBe(T.yellow)
        expect(pill.x + pill.w).toBeLessThanOrEqual(1920 - 96)
        expect(pill.y).toBeGreaterThanOrEqual(REPLAY_ROWS[0])
        expect(pill.y + pill.h).toBeLessThanOrEqual(REPLAY_ROWS[1])
    })
})
