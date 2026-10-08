// Constants and timing shared by every graphics theme (themes/*/layout.ts re-export what their callers need).
export const DESIGN_W = 1920
export const DESIGN_H = 1080
/** Title-safe margins (5 %). */
export const SAFE_X = 96
export const SAFE_Y = 54

export const CARD_SEC = 4
/** Event captions stay on screen for 5 s. */
export const CAPTION_SEC = 5
/** ...starting this long after the marked moment, so the caption does not cover the action itself. */
export const CAPTION_DELAY_SEC = 1
export const CARD_FADE = 0.5
export const OVERLAY_FADE = 0.3

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
export const easeOut = (p: number): number => 1 - (1 - p) ** 3

/** Card fade level at `t`: 0 = black, 1 = fully visible (0.5 s in and out). */
export function cardFade(t: number, duration: number): number {
    return clamp01(Math.min(t / CARD_FADE, (duration - t) / CARD_FADE))
}
