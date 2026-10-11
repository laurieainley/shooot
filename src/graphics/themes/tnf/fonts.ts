// TNF type: Baloo 2 ExtraBold (OFL, static latin woff2 in public/fonts) for the chunky rounded badge lettering,
// JetBrains Mono (shared with the Shooot theme) for clocks and minutes.
export type FontVoice = 'baloo' | 'mono'

export type VoiceFont = { family: string; url: string; fallback: string }

export const VOICES: Record<FontVoice, VoiceFont> = {
    baloo: { family: 'TNF Baloo', url: '/fonts/baloo-2-800.woff2', fallback: 'Arial Rounded MT Bold, Arial Black, Arial, sans-serif' },
    mono: { family: 'Shooot Mono', url: '/fonts/jetbrains-mono-700.woff2', fallback: 'ui-monospace, Menlo, monospace' },
}

export const FONT_VOICES = Object.keys(VOICES) as FontVoice[]

export function fontCss(voice: FontVoice, size: number): string {
    const v = VOICES[voice]
    return `${size}px "${v.family}", ${v.fallback}`
}
