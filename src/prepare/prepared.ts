// What the preparer remembers about how much of a project is prepared, so the relink banner can say so after a reload. Per kind, with the plan
// signature and quality it was for; the units themselves live in the unit cache, and this memory is dropped whenever they stop being claimable
// (plan changed, setting off, project deleted, cache cleared). localStorage only: no imports from the app, so any module may forget.
type Entry = { signature: string; quality: string; percent: number }
type Record_ = Partial<Record<string, Entry>>

const PREFIX = 'shooot-prepared:'
const key = (id: string): string => `${PREFIX}${id}`

function read(id: string): Record_ {
    try {
        const v: unknown = JSON.parse(localStorage.getItem(key(id)) ?? 'null')
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Record_ : {}
    } catch { return {} }
}
function write(id: string, r: Record_): void {
    try { if (Object.keys(r).length === 0) localStorage.removeItem(key(id)); else localStorage.setItem(key(id), JSON.stringify(r)) } catch { /* not kept across reloads */ }
}

export function rememberPrepared(id: string | null, kind: string, signature: string, quality: string, percent: number): void {
    if (!id) return
    write(id, { ...read(id), [kind]: { signature, quality, percent: Math.max(0, Math.min(100, Math.round(percent))) } })
}
/** The kind's plan is `signature` now: what was remembered for another plan is no longer claimed. */
export function syncPrepared(id: string | null, kind: string, signature: string): void {
    if (!id) return
    const r = read(id)
    if (r[kind] && r[kind]!.signature !== signature) { delete r[kind]; write(id, r) }
}
/** One kind, or the whole project when `kind` is left out. */
export function forgetPrepared(id: string | null, kind?: string): void {
    if (!id) return
    if (!kind) { try { localStorage.removeItem(key(id)) } catch { /* nothing kept */ } return }
    const r = read(id)
    if (r[kind]) { delete r[kind]; write(id, r) }
}
export function forgetAllPrepared(): void {
    try {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(PREFIX)) keys.push(k) }
        for (const k of keys) localStorage.removeItem(k)
    } catch { /* nothing kept */ }
}
/** The largest prepared share (0..100) of any kind of the project. */
export function preparedPercent(id: string | null): number {
    if (!id) return 0
    return Math.max(0, ...Object.values(read(id)).map((e) => (e && typeof e.percent === 'number' ? e.percent : 0)))
}
