/** Player names remembered on this device (a preference, never part of a project) and suggested while typing. */
export interface KnownPlayer { name: string; lastUsed: number }

export const MAX_KNOWN_PLAYERS = 200

const key = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const lower = (s: string): string => s.toLowerCase()

/** Merges names in (case-insensitive; the newest spelling and time win), capped at 200 by oldest use. */
export function rememberPlayers(list: KnownPlayer[], names: readonly string[], now: number): KnownPlayer[] {
    const clean = names.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)
    if (!clean.length) return list
    const map = new Map(list.map((x) => [lower(x.name), x]))
    for (const name of clean) map.set(lower(name), { name, lastUsed: now })
    const next = [...map.values()]
    if (next.length <= MAX_KNOWN_PLAYERS) return next
    return next.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_KNOWN_PLAYERS)
}

export function forgetPlayer(list: KnownPlayer[], name: string): KnownPlayer[] {
    return list.filter((x) => lower(x.name) !== lower(name))
}

/** Up to `limit` names for what is being typed: whole-name prefix first, then any word start, each most recent first. */
export function suggestPlayers(list: KnownPlayer[], draft: string, exclude: readonly string[], limit = 6): string[] {
    const skip = new Set(exclude.map(lower))
    const q = key(draft.trim())
    const pool = list.filter((x) => !skip.has(lower(x.name))).sort((a, b) => b.lastUsed - a.lastUsed)
    if (!q) return pool.slice(0, limit).map((x) => x.name)
    const prefix: string[] = []
    const word: string[] = []
    for (const x of pool) {
        const n = key(x.name)
        if (n.startsWith(q)) prefix.push(x.name)
        else if (n.split(/\s+/).some((w) => w.startsWith(q))) word.push(x.name)
    }
    return [...prefix, ...word].slice(0, limit)
}
