// Constants and timing shared by every graphics theme (themes/*/layout.ts re-export what their callers need).
export const DESIGN_W = 1920
export const DESIGN_H = 1080
/** Title-safe margins (5 %). */
export const SAFE_X = 96
export const SAFE_Y = 54

/** The full-time card; the title card (line-ups) stays longer so there is time to read it. */
export const CARD_SEC = 4
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
