// Brand tokens for the video (brand/shooot/tokens.json, dark theme: video is always Night Turf).
import { Easing } from 'remotion'
import tokens from '../../brand/shooot/tokens.json'

const dark = tokens.color.dark
export const C = {
    ground: dark.ground,
    surface: dark.surface,
    surface2: dark.surface2,
    line: dark.line,
    pitch: dark.pitch,
    chalk: dark.text,
    muted: dark.muted,
    lime: tokens.color.brand.lime,
    onLime: tokens.color.brand.onLime,
    rec: tokens.color.brand.rec,
} as const

export const KIT = tokens.color.kit

export const FPS = 30
export const W = 1920
export const H = 1080
export const SKEW_DEG = -10

/** Font stacks. Archivo is the variable face (wght + wdth axes): pick a voice with `voice()`. */
export const FONT = {
    archivo: '"Archivo Var", Arial, sans-serif',
    shirt: '"Big Shoulders Var", "Arial Narrow", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
} as const

type Voice = 'stadium' | 'heading' | 'scoreboard' | 'body' | 'bodyBold'
/** CSS for a brand type voice (BRAND.md › Type). */
export function voice(v: Voice): React.CSSProperties {
    switch (v) {
        case 'stadium': return { fontFamily: FONT.archivo, fontWeight: 900, fontStyle: 'italic', fontStretch: '125%', textTransform: 'uppercase' }
        case 'heading': return { fontFamily: FONT.archivo, fontWeight: 900, fontStyle: 'italic', fontStretch: '85%', textTransform: 'uppercase' }
        case 'scoreboard': return { fontFamily: FONT.archivo, fontWeight: 800, fontStyle: 'italic', fontStretch: '72%', textTransform: 'uppercase' }
        case 'body': return { fontFamily: FONT.archivo, fontWeight: 500, fontStretch: '100%' }
        case 'bodyBold': return { fontFamily: FONT.archivo, fontWeight: 700, fontStretch: '100%' }
    }
}
export const MONO: React.CSSProperties = { fontFamily: FONT.mono, fontWeight: 700 }
export const SHIRT: React.CSSProperties = { fontFamily: FONT.shirt, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }

// Easing: the brand's ease-out, plus sharper editorial curves. Never linear for motion.
export const ease = {
    out: Easing.bezier(0.2, 0.7, 0.2, 1),
    net: Easing.bezier(0.3, 0.6, 0.3, 1),
    expoOut: (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    expoIn: (t: number): number => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    expoInOut: (t: number): number =>
        t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    backOut: Easing.back(1.6),
    quintOut: Easing.bezier(0.22, 1, 0.36, 1),
    quintInOut: Easing.bezier(0.83, 0, 0.17, 1),
    cut: Easing.bezier(0.7, 0, 0.2, 1),
} as const

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
/** Progress 0→1 of `frame` through [start, start + dur], eased. */
export function prog(frame: number, start: number, dur: number, fn: (t: number) => number = ease.out): number {
    if (dur <= 0) return frame >= start ? 1 : 0
    return fn(clamp01((frame - start) / dur))
}
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const sec = (s: number): number => Math.round(s * FPS)
