import type { EventType, Team } from '../types'

const LIST_MARKER = /^\s*(?:\d+[.)]|[-•*])\s*/

export function parseRoster(text: string): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of text.split(/[\n,]/)) {
        const name = part.replace(LIST_MARKER, '').trim().replace(/\s+/g, ' ')
        const k = name.toLowerCase()
        if (!name || seen.has(k)) continue
        seen.add(k)
        out.push(name)
    }
    return out
}

/** Names in alphabetical order, ignoring case and accents (how every person list is shown). */
export function sortNames(names: readonly string[]): string[] {
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export function filterRoster(roster: string[], query: string): string[] {
    const q = query.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((name) => {
        const n = name.toLowerCase()
        return n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))
    })
}

/** The roster a scorer is picked from: the credited team, or the other team for an own goal. */
export function rosterTeamFor(teams: Team[], team: string | undefined, type: EventType): Team | undefined {
    const idx = teams.findIndex((t) => t.name === team)
    if (idx === -1) return undefined
    return type === 'own_goal' ? teams[1 - idx] : teams[idx]
}

