// Constants and timing shared by every graphics theme (themes/*/layout.ts re-export what their callers need).
import type { FontVoice } from './themes/shooot/fonts'

export const DESIGN_W = 1920
export const DESIGN_H = 1080
/** Title-safe margins (5 %). */
export const SAFE_X = 96
export const SAFE_Y = 54

/** The full-time card (8 s: time to take in the final score and scorers) and the title card (line-ups). */
export const CARD_SEC = 8
export const INTRO_SEC = 7
/** Event captions stay on screen for 5 s. */
export const CAPTION_SEC = 5
/** ...starting this long after the marked moment, so the caption does not cover the action itself. */
export const CAPTION_DELAY_SEC = 1
export const CARD_FADE = 0.5
/** The Shooot sting that ends a downloaded clip. */
export const STING_SEC = 3.5
const STING_IN = 0.6
const STING_OUT = 0.5
export const OVERLAY_FADE = 0.3

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
export const easeOut = (p: number): number => 1 - (1 - p) ** 3

/** Card fade level at `t`: 0 = black, 1 = fully visible (0.5 s in and out). */
export function cardFade(t: number, duration: number): number {
    return clamp01(Math.min(t / CARD_FADE, (duration - t) / CARD_FADE))
}

/** The sting's wordmark: eases in (fade + 0.92 to 1 scale) over 0.6 s, holds, fades out over the last 0.5 s. */
export function stingFrame(t: number, d: number): { alpha: number; scale: number } {
    const inP = easeOut(clamp01(t / STING_IN))
    const out = clamp01((d - t) / STING_OUT)
    return { alpha: Math.min(inP, out), scale: 0.92 + 0.08 * inP }
}

/**
 * A caption note on at most `maxLines` rows of `maxWidth`: broken between words (a word wider than a row is broken inside).
 * Only text that does not fit the rows gets a "…" on the last one. `measure` is the theme's text measure (voice defaults to the notes' shirt voice).
 */
export function wrapNote(text: string, maxWidth: number, size: number, measure: (text: string, size: number, voice?: FontVoice) => number, maxLines = 2): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    if (!words.length) return ['']
    const fits = (s: string): boolean => measure(s, size, 'shirt') <= maxWidth
    const lines: string[] = []
    let rest = words
    while (rest.length) {
        const row = lines.length
        const last = row === maxLines - 1
        let line = ''
        let used = 0
        while (used < rest.length) {
            const next = line ? `${line} ${rest[used]}` : rest[used]
            if (fits(next)) { line = next; used++ } else break
        }
        if (used === rest.length) { lines.push(line); break }
        if (!last && used > 0) { lines.push(line); rest = rest.slice(used); continue }
        // Either the last row with text left over, or a single word wider than a row.
        const tail = rest.join(' ')
        if (!last) {
            let n = tail.length
            while (n > 1 && !fits(tail.slice(0, n))) n--
            lines.push(tail.slice(0, n))
            rest = tail.slice(n).split(/\s+/).filter(Boolean)
            continue
        }
        let n = tail.length
        while (n > 0 && !fits(`${tail.slice(0, n).trimEnd()}…`)) n--
        const cut = tail.slice(0, n)
        const space = cut.lastIndexOf(' ')
        lines.push(`${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`)
        break
    }
    return lines
}
