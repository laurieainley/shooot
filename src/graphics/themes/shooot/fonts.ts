// The brand's type voices as the graphics use them. Canvas cannot rely on variable width axes across browsers, so each
// voice is a static woff2 instance (public/fonts, generated with fonttools from Archivo / Big Shoulders / JetBrains Mono).
export type FontVoice = 'stadium' | 'heading' | 'scoreboard' | 'shirt' | 'mono'

export type VoiceFont = { family: string; url: string; fallback: string; letterSpacing: string }

export const VOICES: Record<FontVoice, VoiceFont> = {
    /** Archivo wdth 125 / wght 900 / italic: the loud words (GOAL!, scores, VS). */
    stadium: { family: 'Shooot Stadium', url: '/fonts/archivo-stadium.woff2', fallback: 'Arial Black, Arial, sans-serif', letterSpacing: '0px' },
    /** Archivo wdth 85 / wght 900 / italic: headings. */
    heading: { family: 'Shooot Heading', url: '/fonts/archivo-heading.woff2', fallback: 'Arial Narrow, Arial, sans-serif', letterSpacing: '0px' },
    /** Archivo wdth 72 / wght 800 / italic: team names and initials. */
    scoreboard: { family: 'Shooot Scoreboard', url: '/fonts/archivo-scoreboard.woff2', fallback: 'Arial Narrow, Arial, sans-serif', letterSpacing: '0px' },
    /** Big Shoulders Display 800: player names. */
    shirt: { family: 'Shooot Shirt', url: '/fonts/big-shoulders-800.woff2', fallback: 'Arial Narrow, Arial, sans-serif', letterSpacing: '0.05em' },
    /** JetBrains Mono 700: clocks, scores, minutes. */
    mono: { family: 'Shooot Mono', url: '/fonts/jetbrains-mono-700.woff2', fallback: 'ui-monospace, Menlo, monospace', letterSpacing: '0px' },
}

export const FONT_VOICES = Object.keys(VOICES) as FontVoice[]

/** CSS font shorthand for canvas: the static instance already carries weight, width and slant. */
export function fontCss(voice: FontVoice, size: number): string {
    const v = VOICES[voice]
    return `${size}px "${v.family}", ${v.fallback}`
}
