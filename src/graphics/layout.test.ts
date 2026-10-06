import { describe, it, expect } from 'vitest'
import { BUG_ROWS, CAPTION_DELAY_SEC, CAPTION_ROWS, CAPTION_SEC, captionLayout, cardFade, cardLayout, replayTagLayout, scoreBugLayout, estimateTextWidth, type DrawOp, type RectOp, type TextOp } from './layout'
import { NAVY, ORANGE } from './teamStyle'
import type { BugSpec, CaptionSpec, CardSpec } from './types'

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

describe('captionLayout', () => {
    const bug: BugSpec = { left: 'RR', right: 'WT', leftColour: '#f0f0f0', rightColour: '#ec5fa4', text: '1–0' }
    const goal: CaptionSpec = { label: 'GOAL', person: 'SAM', stripe: '#f0f0f0', bug }
    const alphaAt = (spec: CaptionSpec, t: number, anchored = false): number =>
        Math.max(...captionLayout(spec, t, true, CAPTION_SEC, estimateTextWidth, anchored).map((o) => (o.kind === 'cardBackground' ? 1 : o.alpha ?? 1)))
    const rects = (ops: DrawOp[]): RectOp[] => ops.filter((o): o is RectOp => o.kind === 'rect')

    it('should show the score bug (initials and score) with the event line beneath', () => {
        const ops = captionLayout(goal, 2.5, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['RR', '1–0', 'WT', 'GOAL', 'SAM']))
        const y = (t: string): number => texts(ops).find((o) => o.text === t)!.y
        expect(y('GOAL')).toBeGreaterThan(y('1–0'))
    })

    it('should still show the current score on events that do not score', () => {
        const ops = captionLayout({ label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING', stripe: ORANGE, bug: { ...bug, text: '0–0' } }, 2.5, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['0–0', 'HIGHLIGHT', 'JO', 'NUTMEG ON THE WING']))
    })

    it('should leave the bug out without teams', () => {
        const ops = captionLayout({ label: 'GOAL', person: 'SAM', stripe: ORANGE }, 2.5, true)
        expect(textOf(ops)).toEqual(['GOAL', 'SAM'])
    })

    it('should sit top-left inside title-safe and clear of the top-right REPLAY tag', () => {
        const ops = captionLayout({ ...goal, person: 'MAXIMILIAN ALEXANDER-FOTHERINGHAM THE THIRD', note: 'A VERY LONG NOTE ABOUT A WONDERFUL PIECE OF SKILL THAT GOES ON AND ON' }, 2.5, true)
        const tag = rects(replayTagLayout(1, 6))[0]
        for (const o of rects(ops)) {
            expect(o.x).toBeGreaterThanOrEqual(96)
            expect(o.y).toBeGreaterThanOrEqual(54)
            expect(o.x + o.w).toBeLessThan(tag.x)
            expect(o.y + o.h).toBeLessThanOrEqual(CAPTION_ROWS[1])
        }
        for (const o of texts(ops)) if (o.align === 'left') expect(o.x + (o.maxWidth ?? estimateTextWidth(o.text, o.size))).toBeLessThan(tag.x)
    })

    it('should be legible on a 768×432 reel: event line ≥ 30 px, score ≥ 26 px, note ≥ 20 px', () => {
        const scale = 432 / 1080
        const ops = texts(captionLayout({ ...goal, note: 'TOP CORNER' }, 2.5, true))
        const size = (t: string): number => ops.find((o) => o.text === t)!.size * scale
        expect(size('GOAL')).toBeGreaterThanOrEqual(30)
        expect(size('SAM')).toBeGreaterThanOrEqual(30)
        expect(size('1–0')).toBeGreaterThanOrEqual(26)
        expect(size('RR')).toBeGreaterThanOrEqual(24)
        expect(size('TOP CORNER')).toBeGreaterThanOrEqual(20)
    })

    it('should size the event panel from the measured text', () => {
        const width = (m: (t: string, s: number) => number): number =>
            Math.max(...rects(captionLayout({ label: 'HIGHLIGHT', person: 'JOSEPHINE BLOGGS', stripe: ORANGE }, 2.5, false, CAPTION_SEC, m)).map((r) => r.x + r.w))
        expect(width((t, size) => t.length * size * 0.3)).toBeLessThan(width(estimateTextWidth))
    })

    it('should use the team colours for the stripe and the bug bars', () => {
        const fills = rects(captionLayout(goal, 2.5, true)).map((r) => r.fill)
        expect(fills).toEqual(expect.arrayContaining(['#f0f0f0', '#ec5fa4']))
    })

    it('should be on screen for 5 s, sliding and fading in and out over 0.3 s', () => {
        expect(CAPTION_SEC).toBe(5)
        expect(CAPTION_DELAY_SEC).toBe(1)
        expect(alphaAt(goal, 0)).toBe(0)
        expect(alphaAt(goal, 0.15)).toBeGreaterThan(0)
        expect(alphaAt(goal, 0.15)).toBeLessThan(1)
        expect(alphaAt(goal, 2.5)).toBe(1)
        expect(alphaAt(goal, CAPTION_SEC)).toBe(0)
        const x = (t: number): number => Math.min(...rects(captionLayout(goal, t, true)).map((o) => o.x))
        expect(x(0.1)).toBeLessThan(x(2.5))
    })

    it('should keep the bug row still when anchored to an always-on score bug (only the event line moves)', () => {
        const still = scoreBugLayout(bug, 0, 1, true, false)
        const anchoredStart = captionLayout(goal, 0.05, true, CAPTION_SEC, estimateTextWidth, true)
        for (const r of rects(still)) expect(anchoredStart).toContainEqual(expect.objectContaining({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, fill: r.fill, alpha: 1 }))
        const event = texts(anchoredStart).find((o) => o.text === 'GOAL')!
        expect(event.alpha).toBeLessThan(1)
    })
})

describe('scoreBugLayout', () => {
    const bug: BugSpec = { left: 'WH', right: 'CO', leftColour: '#f5f5f5', rightColour: '#c2364a', text: '2–1' }

    it('should draw initials either side of the score with team colour bars, top-left', () => {
        const ops = scoreBugLayout(bug, 3, 10, true, false)
        expect(textOf(ops)).toEqual(['WH', '2–1', 'CO'])
        const r = ops.filter((o): o is RectOp => o.kind === 'rect')
        expect(r.map((o) => o.fill)).toEqual(expect.arrayContaining(['#f5f5f5', '#c2364a']))
        for (const o of r) {
            expect(o.x).toBeGreaterThanOrEqual(96)
            expect(o.y).toBeGreaterThanOrEqual(54)
            expect(o.y + o.h).toBeLessThanOrEqual(BUG_ROWS[1])
        }
        expect(ops.some((o) => o.kind === 'logo')).toBe(true)
        expect(scoreBugLayout(bug, 3, 10, false, false).some((o) => o.kind === 'logo')).toBe(false)
    })

    it('should stay still when always on and fade in and out when it comes and goes', () => {
        const alpha = (t: number, fade: boolean): number => Math.max(...scoreBugLayout(bug, t, 8, true, fade).map((o) => (o.kind === 'cardBackground' ? 1 : o.alpha ?? 1)))
        expect(alpha(0, false)).toBe(1)
        expect(alpha(0, true)).toBe(0)
        expect(alpha(4, true)).toBe(1)
        expect(alpha(8, true)).toBe(0)
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

    it('should appear instantly, without fading or sliding, for its whole length', () => {
        for (const t of [0, 0.05, 0.15, 3, 5.95]) {
            for (const o of replayTagLayout(t, 6)) expect(o.kind === 'cardBackground' ? 1 : o.alpha ?? 1).toBe(1)
        }
        const x = (t: number): number => Math.min(...replayTagLayout(t, 6).filter((o): o is RectOp => o.kind === 'rect').map((o) => o.x))
        expect(x(0)).toBe(x(3))
    })

    it('should be scaled up like the captions (≥ 26 px text on a 768×432 reel)', () => {
        const text = replayTagLayout(1, 6).find((o): o is TextOp => o.kind === 'text')!
        expect(text.size * 432 / 1080).toBeGreaterThanOrEqual(26)
    })
})
