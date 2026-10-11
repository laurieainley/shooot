import type { Team } from '../types'

import { deriveInitials } from '../utils/initials'
import { C } from './themes/shooot/brandColors'

/** Ink on a light kit colour: the brand's on-lime near-black. */
export const INK_DARK = C.onLime
/** Ink on a dark or saturated kit colour. */
export const WHITE = '#ffffff'

export type TeamBadge = { name: string; initials: string; colour: string; ink: string }

/** Initials for a name (see deriveInitials); '?' when the name is blank. */
export function autoInitials(name: string): string {
    return deriveInitials(name) || '?'
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
