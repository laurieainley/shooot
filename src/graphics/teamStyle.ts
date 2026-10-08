import type { Team } from '../types'

import { C } from './brandColors'

/** Ink on a light kit colour: the brand's on-lime near-black. */
export const INK_DARK = C.onLime
/** Ink on a dark or saturated kit colour. */
export const WHITE = '#ffffff'

export type TeamBadge = { name: string; initials: string; colour: string; ink: string }

/** "Ryan's Rovers" → RR, "Whites" → WH: first letters of up to two words, or two letters of one word. */
export function autoInitials(name: string): string {
    const words = name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
    if (words.length === 0) return '?'
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}

function luminance(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return 0
    const n = parseInt(m[1], 16)
    const lin = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** Initials colour on a team-coloured shield: dark on light kits, white otherwise. */
export function inkFor(colour: string): string {
    return luminance(colour) > 0.4 ? INK_DARK : WHITE
}

export function teamBadge(t: Team): TeamBadge {
    const initials = t.initials?.trim().toUpperCase() || autoInitials(t.name)
    return { name: t.name.trim().toUpperCase(), initials, colour: t.color, ink: inkFor(t.color) }
}
