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

export function filterRoster(roster: string[], query: string): string[] {
    const q = query.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((name) => {
        const n = name.toLowerCase()
        return n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))
    })
}

export function teamShortcuts(names: string[]): string[] {
    const lower = names.map((n) => n.trim().toLowerCase())
    const firsts = lower.map((n) => n[0] ?? '')
    if (new Set(firsts).size === firsts.length && firsts.every(Boolean)) return firsts
    const len = Math.min(...lower.map((n) => n.length))
    for (let i = 1; i < len; i++) {
        const chars = lower.map((n) => n[i])
        if (new Set(chars).size === chars.length) return chars
    }
    return names.map((_, i) => String(i + 1))
}
