// TNF type: Barlow Condensed ExtraBold Italic (OFL, static latin woff2 in public/fonts), the broadcast voice for every
// word; JetBrains Mono (shared with the Shooot theme) for scores, clocks and minutes.
export type FontVoice = 'display' | 'mono'

/** `scale`: the layout's sizes are multiplied by this (a condensed face needs a larger size to fill the same plates). */
export type VoiceFont = { family: string; url: string; fallback: string; scale?: number }

export const VOICES: Record<FontVoice, VoiceFont> = {
    display: { family: 'TNF Display', url: '/fonts/barlow-condensed-800-italic.woff2', fallback: 'Arial Narrow, Arial, sans-serif', scale: 1.2 },
    mono: { family: 'Shooot Mono', url: '/fonts/jetbrains-mono-700.woff2', fallback: 'ui-monospace, Menlo, monospace' },
}

export const FONT_VOICES = Object.keys(VOICES) as FontVoice[]

export function fontCss(voice: FontVoice, size: number): string {
    const v = VOICES[voice]
    return `${Math.round(size * (v.scale ?? 1) * 100) / 100}px "${v.family}", ${v.fallback}`
}
