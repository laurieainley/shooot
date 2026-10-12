// YouTube thumbnail graphics: a short list of draw ops in a 1280×720 space, built per theme and painted on a canvas.
export const THUMB_W = 1280
export const THUMB_H = 720

export type ThumbSpec = {
    kind: 'highlights' | 'fullMatch'
    /** Team names exactly as set up. The score is never part of a thumbnail (it would give the result away). */
    team1: string
    team2: string
    /** The matchday title; shown only when short. */
    title: string | null
    hasLogo: boolean
}

export type FontFn = (size: number) => string
export type Measure = (text: string, font: FontFn, size: number) => number

export type ThumbOp =
    | { kind: 'shade'; y0: number; y1: number; from: number; to: number }
    | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: string; alpha?: number; stroke?: string; lineWidth?: number; skew?: boolean }
    | { kind: 'text'; text: string; x: number; y: number; size: number; font: FontFn; color: string; align: 'left' | 'center' | 'right'; maxWidth?: number }
    | { kind: 'logo'; x: number; y: number; h: number }

export type ThumbLayout = (spec: ThumbSpec, measure: Measure) => ThumbOp[]
