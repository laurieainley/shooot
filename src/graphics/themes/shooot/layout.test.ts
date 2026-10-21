import { describe, it, expect } from 'vitest'
import { BUG_ROWS, OVERLAY_SCALE, leanShift, CAPTION_DELAY_SEC, CAPTION_ROWS, CAPTION_SEC, captionLayout, cardFade, cardLayout, replayTagLayout, scoreBugLayout, estimateTextWidth, type DrawOp, type PolyOp, type RectOp, type TextOp } from './layout'
import { C } from './brandColors'
import type { ScorerLine } from '../../types'
import { END_LINE_Y, wrapMinutes } from './layout'
import { INK_DARK } from '../../teamStyle'
import type { BugSpec, CaptionSpec, CardSpec } from '../../types'

const left = { name: "RYAN'S ROVERS", initials: 'RR', colour: '#f0f0f0', ink: INK_DARK }
const right = { name: 'WALFORD TOWN', initials: 'WT', colour: '#ec5fa4', ink: '#ffffff' }
const vs: CardSpec = { heading: 'MATCHDAY 1', centre: 'VS', left, right }
const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.kind === 'text')
const textOf = (ops: DrawOp[]): string[] => texts(ops).map((o) => o.text)

describe('cardLayout', () => {
    it('should draw heading, centre, initials and names', () => {
        const ops = cardLayout(vs, 2, 4, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['MATCHDAY 1', 'VS', 'RR', 'WT', "RYAN'S ROVERS", 'WALFORD TOWN']))
        // the heading is a lime tag with on-lime text in the stadium voice
        expect(texts(ops).find((o) => o.text === 'MATCHDAY 1')).toMatchObject({ color: C.onLime, voice: 'stadium' })
        expect(ops.some((o) => o.kind === 'rect' && o.fill === C.lime && o.skew !== undefined)).toBe(true)
    })

    it('should set team names in the scoreboard voice and the VS roundel in lime', () => {
        const ops = cardLayout(vs, 2, 4, true)
        expect(texts(ops).find((o) => o.text === 'WALFORD TOWN')?.voice).toBe('scoreboard')
        expect(ops.find((o) => o.kind === 'circle' && o.fill === C.lime)).toBeDefined()
        expect(texts(ops).find((o) => o.text === 'VS')).toMatchObject({ color: C.onLime, voice: 'stadium' })
    })

    it('should lay faint pitch markings under the content of both cards', () => {
        expect(cardLayout(vs, 2, 4, false).some((o) => o.kind === 'pitch')).toBe(true)
        expect(cardLayout({ ...vs, heading: 'FULL TIME', centre: '1 - 0' }, 2, 4, false).some((o) => o.kind === 'pitch')).toBe(true)
    })

    it('should put each team on its own side with its colours', () => {
        const ops = cardLayout(vs, 2, 4, true)
        // a split field: the two kit colours, left and right of a leaning line through the middle
        const fields = ops.filter((o): o is PolyOp => o.kind === 'poly')
        expect(fields.map((f) => f.fill)).toEqual(['#f0f0f0', '#ec5fa4'])
        expect(Math.max(...fields[0].points.map((p) => p[0]))).toBeLessThan(1100)
        expect(Math.min(...fields[1].points.map((p) => p[0]))).toBeGreaterThan(800)
        expect(texts(ops).find((o) => o.text === 'RR')!.x).toBeLessThan(960)
        expect(texts(ops).find((o) => o.text === 'WT')!.x).toBeGreaterThan(960)
        // the kit colour also under each name
        expect(ops.filter((o) => o.kind === 'rect' && o.h === 8).map((o) => o.kind === 'rect' && o.fill)).toEqual(['#f0f0f0', '#ec5fa4'])
        // chalk text sits on a wash over the field, so light kits stay readable
        expect(texts(ops).find((o) => o.text === 'RR')?.color).toBe('#ffffff')
    })

    it('should show the score as "2 - 3" style centre text on the full-time card', () => {
        const ops = cardLayout({ ...vs, heading: 'FULL TIME', centre: '2 - 3' }, 2, 4, true)
        expect(textOf(ops)).toContain('2 - 3')
        expect(textOf(ops)).toContain('FULL TIME')
    })

    it('should list the scorers in two columns with minutes, and end with "Made with Shooot"', () => {
        const scorers = { left: [{ name: 'SAM TAYLOR', minutes: "13' 44'" }], right: [{ name: 'JO BLOGGS', minutes: "60' PEN" }] }
        const ops = cardLayout({ ...vs, heading: 'FULL TIME', centre: '1 - 1', scorers }, 2, 4, true)
        const sam = texts(ops).find((o) => o.text === 'SAM TAYLOR')!
        const jo = texts(ops).find((o) => o.text === 'JO BLOGGS')!
        expect(sam).toMatchObject({ voice: 'shirt' })
        expect(sam.x).toBeLessThan(960)
        expect(jo.x).toBeGreaterThan(960)
        expect(texts(ops).find((o) => o.text === "13' 44'")).toMatchObject({ voice: 'mono', y: sam.y })
        expect(texts(ops).find((o) => o.text === 'FULL TIME')).toBeDefined()
        expect(textOf(ops)).toContain('Made with Shooot')
        expect(ops.some((o) => o.kind === 'circle' && o.fill === C.rec)).toBe(true)
    })

    it('should keep a long scorers list on the card, ending with a +N MORE line', () => {
        const left = Array.from({ length: 9 }, (_, i) => ({ name: `PLAYER ${i}`, minutes: `'${i + 1}` }))
        const ops = cardLayout({ ...vs, heading: 'FULL TIME', centre: '9 - 0', scorers: { left, right: [] } }, 2, 4, false)
        // the block shrinks to its floor first, so more fit than at full size, then +N MORE
        const more = textOf(ops).find((t) => t.endsWith(' MORE'))!
        expect(more).toBe(`+${9 - texts(ops).filter((o) => o.text.startsWith('PLAYER')).length} MORE`)
        expect(Math.max(...texts(ops).map((o) => o.y))).toBeLessThan(1080 - 54)
    })

    it('should not show the end line or scorers on the VS card', () => {
        expect(textOf(cardLayout(vs, 2, 4, true))).not.toContain('Made with Shooot')
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
    const alphaAt = (spec: CaptionSpec, t: number): number =>
        Math.max(...captionLayout(spec, t, true, CAPTION_SEC, estimateTextWidth).map((o) => (o.kind === 'cardBackground' ? 1 : o.alpha ?? 1)))
    const rects = (ops: DrawOp[]): RectOp[] => ops.filter((o): o is RectOp => o.kind === 'rect')

    it('should show the score bug (initials and score) with the event line beneath', () => {
        const ops = captionLayout(goal, 2.5, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['RR', '1–0', 'WT', 'GOAL', 'SAM']))
        const y = (t: string): number => texts(ops).find((o) => o.text === t)!.y
        expect(y('GOAL')).toBeGreaterThan(y('1–0'))
    })

    it('should still show the current score on events that do not score', () => {
        const ops = captionLayout({ label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING', stripe: C.muted, bug: { ...bug, text: '0–0' } }, 2.5, true)
        expect(textOf(ops)).toEqual(expect.arrayContaining(['0–0', 'HIGHLIGHT', 'JO', 'NUTMEG ON THE WING']))
    })

    it('should leave the bug out without teams', () => {
        const ops = captionLayout({ label: 'GOAL', person: 'SAM', stripe: C.muted }, 2.5, true)
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

    it('should be legible on a 768×432 reel: event line ≥ 18 px, score ≥ 15 px, note ≥ 11 px (20 % smaller again)', () => {
        const scale = 432 / 1080
        const ops = texts(captionLayout({ ...goal, note: 'TOP CORNER' }, 2.5, true))
        const size = (t: string): number => ops.find((o) => o.text === t)!.size * scale
        expect(size('GOAL')).toBeGreaterThanOrEqual(18)
        expect(size('SAM')).toBeGreaterThanOrEqual(18)
        expect(size('1–0')).toBeGreaterThanOrEqual(15)
        expect(size('RR')).toBeGreaterThanOrEqual(14)
        expect(size('TOP CORNER')).toBeGreaterThanOrEqual(11)
    })

    it('should size the event panel from the measured text', () => {
        const width = (m: (t: string, s: number) => number): number =>
            Math.max(...rects(captionLayout({ label: 'HIGHLIGHT', person: 'JOSEPHINE BLOGGS', stripe: C.muted }, 2.5, false, CAPTION_SEC, m)).map((r) => r.x + r.w))
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
})

describe('text centring in panels', () => {
    const bug: BugSpec = { left: 'WH', right: 'CO', leftColour: '#f5f5f5', rightColour: '#c2364a', text: '2–1' }
    const panelOf = (ops: DrawOp[], t: TextOp): RectOp =>
        ops.filter((o): o is RectOp => o.kind === 'rect' && o.x <= t.x + 1 && t.y > o.y && t.y < o.y + o.h && o.h > 20).sort((a, b) => a.w * a.h - b.w * b.h)[0]

    it('should anchor the score bug and REPLAY texts exactly on the vertical centre of their panel (the painter centres the ink from measured metrics)', () => {
        const ops = [...scoreBugLayout(bug, 3, 10, true, false), ...replayTagLayout(1, 6)]
        const middle = texts(ops).filter((o) => o.baseline === 'middle')
        expect(middle).toHaveLength(4)
        for (const t of middle) {
            const p = panelOf(ops, t)
            expect(t.y).toBeCloseTo(p.y + p.h / 2, 5)
        }
    })

    it('should centre the event line in its own row and the note in its own band', () => {
        const ops = captionLayout({ label: 'GOAL', person: 'SAM', note: 'TOP BINS', stripe: '#fff', bug }, 2.5, true)
        const top = 54 + Math.round(64 * OVERLAY_SCALE)
        const eventH = Math.round(72 * OVERLAY_SCALE)
        const noteH = Math.round(46 * OVERLAY_SCALE)
        expect(texts(ops).find((o) => o.text === 'GOAL')!.y).toBe(top + eventH / 2)
        expect(texts(ops).find((o) => o.text === 'SAM')!.y).toBe(top + eventH / 2)
        expect(texts(ops).find((o) => o.text === 'TOP BINS')!.y).toBe(top + eventH + noteH / 2)
    })
})

describe('captionLayout with an assist', () => {
    const bug: BugSpec = { left: 'RR', right: 'WT', leftColour: '#f0f0f0', rightColour: '#ec5fa4', text: '1–0' }
    const goal: CaptionSpec = { label: 'GOAL', person: 'SAM', assist: 'JO', stripe: '#f0f0f0', bug }
    const rects = (ops: DrawOp[]): RectOp[] => ops.filter((o): o is RectOp => o.kind === 'rect')
    const tag = rects(replayTagLayout(1, 6))[0]

    it('should keep GOAL · SAM on the event line and put a smaller "ASSIST: JO" beneath', () => {
        const ops = texts(captionLayout(goal, 2.5, true))
        const sam = ops.find((o) => o.text === 'SAM')!
        const assist = ops.find((o) => o.text === 'ASSIST: JO')!
        expect(assist.y).toBeGreaterThan(sam.y)
        expect(assist.size).toBeLessThan(sam.size)
        expect(assist.x).toBe(ops.find((o) => o.text === 'GOAL')!.x)
    })

    it('should stack the note under the assist, inside title-safe and the caption rows, clear of the REPLAY tag', () => {
        const ops = captionLayout({ ...goal, person: 'MAXIMILIAN ALEXANDER-FOTHERINGHAM THE THIRD', assist: 'A VERY LONG ASSIST NAME THAT KEEPS GOING ON AND ON', note: 'TOP BINS FROM THE EDGE OF THE AREA' }, 2.5, true)
        const t = texts(ops)
        expect(t.find((o) => o.text.startsWith('ASSIST'))!.y).toBeLessThan(t.find((o) => o.text.startsWith('TOP BINS'))!.y)
        for (const o of rects(ops)) {
            expect(o.x).toBeGreaterThanOrEqual(96)
            expect(o.x + o.w).toBeLessThan(tag.x)
            expect(o.y + o.h).toBeLessThanOrEqual(CAPTION_ROWS[1])
        }
        for (const o of t) if (o.align === 'left') expect(o.x + (o.maxWidth ?? estimateTextWidth(o.text, o.size))).toBeLessThan(tag.x)
        const panelBottom = Math.max(...rects(ops).filter((o) => o.fill === C.ground).map((o) => o.y + o.h))
        for (const o of t) expect(o.y + o.size / 2).toBeLessThanOrEqual(panelBottom)
    })

    it('should be legible on a 768×432 reel (assist ≥ 11 px)', () => {
        expect(texts(captionLayout(goal, 2.5, true)).find((o) => o.text === 'ASSIST: JO')!.size * (432 / 1080)).toBeGreaterThanOrEqual(11)
    })

    it('should not grow the caption without an assist', () => {
        const heightOf = (spec: CaptionSpec): number => Math.max(...rects(captionLayout(spec, 2.5, true)).map((o) => o.y + o.h))
        expect(heightOf(goal)).toBeGreaterThan(heightOf({ ...goal, assist: undefined }))
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
        expect(texts(ops)[0].voice).toBe('mono')
        const box = ops.find((o) => o.kind === 'rect')!
        // the lean moves its top-right corner out by leanShift: the corner still lies inside title-safe
        expect(box.kind === 'rect' && box.x + box.w + leanShift(box.h)).toBeLessThanOrEqual(1824)
        expect(box.kind === 'rect' && box.y).toBeGreaterThanOrEqual(54)
    })

    it('should show the actual replay speed', () => {
        expect(textOf(replayTagLayout(1, 6, estimateTextWidth))).toEqual(['REPLAY'])
    })

    it('should lean and carry a red record dot', () => {
        const ops = replayTagLayout(1, 6)
        expect(ops.some((o) => o.kind === 'circle' && o.fill === C.rec)).toBe(true)
        expect(ops.find((o) => o.kind === 'rect')).toMatchObject({ skew: expect.any(Number) })
    })

    it('should appear instantly, without fading or sliding, for its whole length', () => {
        for (const t of [0, 0.05, 0.15, 3, 5.95]) {
            for (const o of replayTagLayout(t, 6)) expect(o.kind === 'cardBackground' ? 1 : o.alpha ?? 1).toBe(1)
        }
        const x = (t: number): number => Math.min(...replayTagLayout(t, 6).filter((o): o is RectOp => o.kind === 'rect').map((o) => o.x))
        expect(x(0)).toBe(x(3))
    })

    it('should widen to fit its text in a wider fallback font and stay inside the title-safe margin', () => {
        const wide = (text: string, size: number): number => text.length * size * 0.8
        const box = replayTagLayout(1, 6, wide).find((o): o is RectOp => o.kind === 'rect')!
        const narrow = replayTagLayout(1, 6).find((o): o is RectOp => o.kind === 'rect')!
        expect(box.w).toBeGreaterThan(narrow.w)
        expect(box.x + box.w + leanShift(box.h)).toBe(1824)
        expect(box.w).toBeGreaterThanOrEqual(wide('REPLAY', 50))
    })

    it('should be scaled like the captions (≥ 15 px text on a 768×432 reel)', () => {
        const text = replayTagLayout(1, 6).find((o): o is TextOp => o.kind === 'text')!
        expect(text.size * 432 / 1080).toBeGreaterThanOrEqual(15)
    })
})

describe('overlay size', () => {
    it('should draw captions, score bug and REPLAY tag 20 % smaller again than the previous design', () => {
        expect(OVERLAY_SCALE).toBeCloseTo(1.4 * 0.75 * 0.8, 5)
        const [tag] = replayTagLayout(0, 5).filter((o): o is RectOp => o.kind === 'rect')
        expect(tag.h).toBe(Math.round(64 * OVERLAY_SCALE))
        expect(tag.h).toBeLessThan(Math.round(64 * 1.4))
    })
})

describe('multicolour team in cards', () => {
    it('should keep the multi fill on the field and outline the white initials', () => {
        const multi = { name: 'MIXED', initials: 'MX', colour: 'multi', ink: '#ffffff' }
        const ops = cardLayout({ heading: 'H', centre: 'VS', left: multi, right: multi }, 2, 4, false)
        expect(ops.filter((o) => o.kind === 'poly').map((o) => o.kind === 'poly' && o.fill)).toEqual(['multi', 'multi'])
        expect(ops.find((o) => o.kind === 'rect' && o.h === 8)).toMatchObject({ fill: 'multi' })
        const initials = ops.find((o): o is TextOp => o.kind === 'text' && o.text === 'MX')!
        expect(initials.color).toBe('#ffffff')
        expect(initials.outline).toBeTruthy()
    })

    it('should not outline initials on a solid shield', () => {
        const solid = { name: 'A', initials: 'AA', colour: '#336699', ink: '#ffffff' }
        const ops = cardLayout({ heading: 'H', centre: 'VS', left: solid, right: solid }, 2, 4, false)
        expect(ops.find((o): o is TextOp => o.kind === 'text' && o.text === 'AA')!.outline).toBeUndefined()
    })
})

describe('captionLayout brand look', () => {
    const bug: BugSpec = { left: 'RR', right: 'WT', leftColour: '#f0f0f0', rightColour: '#ec5fa4', text: '1–0' }
    const goal: CaptionSpec = { label: 'GOAL!', person: 'SAM TAYLOR', minute: "34'", stripe: '#f0f0f0', bug }
    const rects = (ops: DrawOp[]): RectOp[] => ops.filter((o): o is RectOp => o.kind === 'rect')
    const slabOf = (ops: DrawOp[], label: string): RectOp => {
        const t = texts(ops).find((o) => o.text === label)!
        return rects(ops).filter((r) => r.y <= t.y && t.y <= r.y + r.h && r.x <= t.x && t.x <= r.x + r.w).sort((a, b) => a.w * a.h - b.w * b.h)[0]
    }

    it('should draw the score in mono on lime between initials in the scoreboard voice', () => {
        const ops = captionLayout(goal, 2.5, false)
        expect(texts(ops).find((o) => o.text === '1–0')).toMatchObject({ voice: 'mono', color: C.onLime })
        expect(slabOf(ops, '1–0').fill).toBe(C.lime)
        expect(texts(ops).find((o) => o.text === 'RR')).toMatchObject({ voice: 'scoreboard', color: C.text })
    })

    it('should end the score bug with 5 px kit-colour bars at both outer edges', () => {
        const bars = rects(scoreBugLayout(bug, 3, 10, false, false)).filter((r) => r.w === 5)
        expect(bars.map((b) => b.fill)).toEqual(['#f0f0f0', '#ec5fa4'])
        const all = rects(scoreBugLayout(bug, 3, 10, false, false))
        expect(bars[0].x).toBe(Math.min(...all.map((r) => r.x)))
        expect(bars[1].x + bars[1].w).toBe(Math.max(...all.map((r) => r.x + r.w)))
    })

    it('should lean the whole caption together about one pivot', () => {
        const pivots = new Set(captionLayout({ ...goal, assist: 'JO' }, 2.5, true).map((o) => (o.kind === 'rect' || o.kind === 'text' || o.kind === 'logo' ? o.skew : 'n/a')).filter((s) => s !== 'n/a'))
        expect(pivots.size).toBe(1)
        expect([...pivots][0]).toEqual(expect.any(Number))
    })

    it('should keep the leaning lower-left corner inside the title-safe margin', () => {
        const ops = captionLayout({ ...goal, assist: 'JO', note: 'TOP BINS' }, 2.5, true)
        const pivot = rects(ops)[0].skew!
        for (const r of rects(ops)) {
            const bottomLeft = r.x - 0.1763 * (r.y + r.h - pivot)
            expect(bottomLeft).toBeGreaterThanOrEqual(96 - 1)
        }
    })

    it('should put the goal word on a lime slab in the stadium voice, then the name in the shirt voice and the minute in mono', () => {
        const ops = captionLayout(goal, 2.5, true)
        expect(texts(ops).find((o) => o.text === 'GOAL!')).toMatchObject({ voice: 'stadium', color: C.onLime })
        expect(slabOf(ops, 'GOAL!').fill).toBe(C.lime)
        const name = texts(ops).find((o) => o.text === 'SAM TAYLOR')!
        const minute = texts(ops).find((o) => o.text === "34'")!
        expect(name.voice).toBe('shirt')
        expect(minute.voice).toBe('mono')
        expect(name.x).toBeGreaterThan(texts(ops).find((o) => o.text === 'GOAL!')!.x)
        expect(minute.x).toBeGreaterThan(name.x)
        // the name sits on the dark bar
        expect(slabOf(ops, 'SAM TAYLOR').fill).toBe(C.ground)
    })

    it('should draw an own goal in chalk with an OG chip, never red', () => {
        const ops = captionLayout({ ...goal, label: 'OWN GOAL', tone: 'ownGoal' }, 2.5, true)
        expect(slabOf(ops, 'OWN GOAL').fill).toBe(C.text)
        expect(textOf(ops)).toContain('OG')
        for (const r of rects(ops)) expect(r.fill).not.toBe(C.rec)
        expect(textOf(captionLayout(goal, 2.5, true))).not.toContain('OG')
    })

    it('should draw other events on a dark slab with chalk text', () => {
        const ops = captionLayout({ ...goal, label: 'SAVE', tone: 'other' }, 2.5, true)
        expect(slabOf(ops, 'SAVE').fill).toBe(C.surface2)
        expect(texts(ops).find((o) => o.text === 'SAVE')!.color).toBe(C.text)
    })

    it('should shorten a long name rather than pass the limit left of the REPLAY tag', () => {
        const tag = replayTagLayout(1, 6).find((o): o is RectOp => o.kind === 'rect')!
        const ops = captionLayout({ ...goal, person: 'MAXIMILIAN ALEXANDER-FOTHERINGHAM THE THIRD' }, 2.5, true)
        const name = texts(ops).find((o) => o.text.startsWith('MAXIMILIAN'))!
        const minute = texts(ops).find((o) => o.text === "34'")!
        expect(name.x + name.maxWidth!).toBeLessThanOrEqual(minute.x)
        expect(minute.x + estimateTextWidth("34'", minute.size, 'mono')).toBeLessThan(tag.x)
    })
})

const ft = (left: ScorerLine[], right: ScorerLine[]): CardSpec => ({ ...vs, heading: 'FULL TIME', centre: '18 - 11', scorers: { left, right } })
const mono8 = "9' 13' 13' 14' 16' 35' 37' 42'"
const big = ft(
    [{ name: 'MATT', minutes: "2' 5' 18' 24'" }, { name: 'RYAN', minutes: mono8 }, { name: 'JAMES', minutes: "1' 2' 3' 4'" }, { name: 'STEVE W', minutes: "2' 3'" }],
    [{ name: 'ROB', minutes: "1' 2' 3'" }, { name: 'LEE', minutes: "5' 6'" }, { name: 'SAM TAYLOR', minutes: "7' 8' 9' 10'" }],
)
const scorerOps = (ops: DrawOp[]): TextOp[] => texts(ops).filter((o) => o.y > 650 && o.y < END_LINE_Y - 20 && (o.voice === 'mono' || o.voice === 'shirt'))

describe('full-time scorers', () => {
    it('should wrap an 8-goal scorer onto 2 lines at full size, between minutes', () => {
        const ops = cardLayout(big, 2, 4, false)
        const lines = texts(ops).filter((o) => o.voice === 'mono' && o.x > 500 && o.x < 960 && mono8.includes(o.text) && o.text.length > 3)
        expect(lines).toHaveLength(2)
        expect(lines.map((l) => l.text).join(' ')).toBe(mono8)
        expect(lines[0].size).toBe(40)
        expect(lines[1].y - lines[0].y).toBeGreaterThan(40)
    })

    it('should not break inside a minute and keep PEN with its minute', () => {
        const w = (t: string, size: number): number => estimateTextWidth(t, size, 'mono')
        const lines = wrapMinutes("13' 44' 51' 60' PEN 70'", 40, w("13' 44' 51' 60'", 40), w)
        expect(lines.join(' ')).toBe("13' 44' 51' 60' PEN 70'")
        expect(lines.every((l) => !l.startsWith('PEN'))).toBe(true)
    })

    it('should push the rows below a wrapped scorer down', () => {
        const ops = cardLayout(big, 2, 4, false)
        const y = (name: string): number => texts(ops).find((o) => o.text === name)!.y
        expect(y('JAMES') - y('RYAN')).toBeGreaterThan(64)
        expect(y('RYAN') - y('MATT')).toBe(64)
    })

    it('should never squash text: every op fits its maxWidth at its own size', () => {
        for (const spec of [big, ft([{ name: 'A', minutes: mono8 }], [])]) {
            for (const o of scorerOps(cardLayout(spec, 2, 4, false))) {
                if (o.maxWidth) expect(estimateTextWidth(o.text, o.size, o.voice)).toBeLessThanOrEqual(o.maxWidth)
            }
        }
    })

    it('should keep the minutes column clear of the centre line and the safe area', () => {
        const mins = texts(cardLayout(big, 2, 4, false)).filter((o) => o.voice === 'mono' && o.align === 'left' && o.y > 650 && o.y < END_LINE_Y - 20)
        for (const o of mins) {
            const right = o.x + Math.min(o.maxWidth ?? Infinity, estimateTextWidth(o.text, o.size, 'mono'))
            expect(right).toBeLessThanOrEqual(o.x < 960 ? 940 : 1920 - 96)
        }
    })

    it('should keep the block above the end line, shrinking uniformly when crowded', () => {
        const names = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF']
        const crowd = ft(names.map((name) => ({ name, minutes: mono8 })), [])
        const ops = cardLayout(crowd, 2, 4, false)
        const rows = scorerOps(ops)
        expect(Math.max(...rows.map((o) => o.y + o.size / 2))).toBeLessThanOrEqual(END_LINE_Y - 14)
        const nameSize = texts(ops).find((o) => o.text === 'AA')!.size
        const minSize = rows.find((o) => o.voice === 'mono')!.size
        expect(nameSize).toBeLessThan(54)
        expect(nameSize / 54).toBeCloseTo(minSize / 40) // names and minutes scale together
    })

    it('should fall back to +N MORE when even the smallest scale does not fit', () => {
        const ten = ft(Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, minutes: `${i + 1}'` })), [])
        const ops = cardLayout(ten, 2, 4, false)
        const shown = texts(ops).filter((o) => /^P\d$/.test(o.text)).length
        expect(shown).toBeLessThan(10)
        expect(textOf(ops)).toContain(`+${10 - shown} MORE`)
        expect(Math.max(...texts(ops).filter((o) => o.y < END_LINE_Y - 20).map((o) => o.y + o.size / 2))).toBeLessThanOrEqual(END_LINE_Y - 14)
    })

    it('should keep the simple 2-1 card at full size', () => {
        const ops = cardLayout(ft([{ name: 'SAM', minutes: "3' 9'" }], [{ name: 'JO', minutes: "5'" }]), 2, 4, false)
        expect(texts(ops).find((o) => o.text === 'SAM')!.size).toBe(54)
    })
})

describe('end line', () => {
    it('should sit at least 24 px above the TNF stripe band for its full height, with a record-red dot', () => {
        const ops = cardLayout(ft([], []), 2, 4, false)
        const t = texts(ops).find((o) => o.text === 'Made with Shooot')!
        expect(t.y + t.size / 2 + 24).toBeLessThanOrEqual(1036)
        expect(ops.find((o) => o.kind === 'circle' && o.fill === C.rec)).toMatchObject({ keepColour: true })
    })
})

describe('line-ups on the VS card', () => {
    const names = (n: number): string[] => Array.from({ length: n }, (_, i) => `PLAYER ${i + 1}`)
    const withRoster = (l: string[], r: string[]): CardSpec => ({ ...vs, left: { ...left, roster: l }, right: { ...right, roster: r } })
    const shirts = (ops: DrawOp[]): PolyOp[] => ops.filter((o): o is PolyOp => o.kind === 'poly' && !!o.stroke)

    it('should leave the card exactly as before when neither team has a roster', () => {
        const plain = cardLayout(vs, 2, 4, true)
        expect(cardLayout({ ...vs, left: { ...left, roster: [] }, right: { ...right, roster: [] } }, 2, 4, true)).toEqual(plain)
        expect(texts(plain).find((o) => o.text === 'RR')!.size).toBe(250)
        expect(shirts(plain)).toHaveLength(0)
    })

    it('should list each name with a kit-colour shirt, left-aligned, in that team half', () => {
        const ops = cardLayout(withRoster(['AL', 'BEN', 'CY'], []), 2, 4, false)
        const t = texts(ops).filter((o) => ['AL', 'BEN', 'CY'].includes(o.text))
        expect(t).toHaveLength(3)
        expect(t.every((o) => o.voice === 'shirt' && o.align === 'left' && o.x < 960)).toBe(true)
        expect(new Set(t.map((o) => o.x)).size).toBe(1)
        expect(shirts(ops).map((p) => p.fill)).toEqual(['#f0f0f0', '#f0f0f0', '#f0f0f0'])
    })

    it('should shrink the initials and lift the team name and kit bar to make room', () => {
        const plain = cardLayout(vs, 2, 4, false)
        const ops = cardLayout(withRoster(names(5), []), 2, 4, false)
        expect(texts(ops).find((o) => o.text === 'RR')!.size).toBeLessThan(250)
        expect(texts(ops).find((o) => o.text === 'WALFORD TOWN')!.y).toBeLessThan(texts(plain).find((o) => o.text === 'WALFORD TOWN')!.y)
        expect(texts(ops).find((o) => o.text === 'MATCHDAY 1')!.y).toBe(texts(plain).find((o) => o.text === 'MATCHDAY 1')!.y)
    })

    it('should use one column up to 6 names, two up to 12, then +N MORE', () => {
        const xs = (n: number): number => new Set(texts(cardLayout(withRoster(names(n), []), 2, 4, false)).filter((o) => o.text.startsWith('PLAYER')).map((o) => o.x)).size
        expect(xs(5)).toBe(1)
        expect(xs(6)).toBe(1)
        expect(xs(8)).toBe(2)
        expect(xs(12)).toBe(2)
        expect(textOf(cardLayout(withRoster(names(13), []), 2, 4, false))).toContain('+2 MORE')
    })

    it('should keep the lists in their halves, above the bottom safe edge, with every name inside its width', () => {
        const ops = cardLayout(withRoster(names(12), names(13)), 2, 4, false)
        for (const o of texts(ops).filter((x) => /PLAYER|MORE/.test(x.text))) {
            const w = Math.min(o.maxWidth ?? Infinity, estimateTextWidth(o.text, o.size, o.voice))
            if (o.x < 960) expect(o.x + w).toBeLessThan(900)
            else expect(o.x).toBeGreaterThan(960)
            expect(o.x + w).toBeLessThanOrEqual(1920 - 96)
            expect(o.y + o.size / 2).toBeLessThanOrEqual(1080 - 54)
        }
    })

    it('should outline light kits dark and use the multicolour fill with an outline', () => {
        const multi = { name: 'M', initials: 'M', colour: 'multi', ink: '#fff', roster: ['X'] }
        const ops = cardLayout({ ...vs, left: { ...left, roster: ['A'] }, right: multi }, 2, 4, false)
        const [light, mix] = shirts(ops)
        expect(light.stroke).toBe(C.ground)
        expect(mix.fill).toBe('multi')
        expect(mix.stroke).toBe(C.ground)
    })

    it('should not draw rosters on the full-time card', () => {
        const ops = cardLayout({ ...withRoster(names(3), names(3)), heading: 'FULL TIME', centre: '1 - 0' }, 2, 4, false)
        expect(textOf(ops)).not.toContain('PLAYER 1')
    })
})
