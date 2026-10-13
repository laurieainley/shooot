// Saved matches on this device: one IndexedDB record per match (see utils/matchRecord.ts).
import { createStore, del, entries, get, set } from 'idb-keyval'
import { bumpMatches } from '../components/openMatch'
import type { MatchRecord, MatchSummary } from '../utils/matchRecord'

export type MatchListItem =
    | { id: string; summary: MatchSummary; updatedAt: number; broken?: false }
    | { id: string; broken: true }

const store = createStore('shooot-matches', 'matches')

function isRecord(v: unknown): v is MatchRecord {
    if (!v || typeof v !== 'object') return false
    const r = v as Record<string, unknown>
    return typeof r.id === 'string' && typeof r.updatedAt === 'number' && !!r.data && typeof r.data === 'object'
        && Array.isArray(r.files) && !!r.summary && typeof r.summary === 'object'
}

export async function listMatches(): Promise<MatchListItem[]> {
    const all = await entries(store)
    const good: { id: string; summary: MatchSummary; updatedAt: number }[] = []
    const broken: MatchListItem[] = []
    for (const [key, value] of all) {
        if (isRecord(value)) good.push({ id: value.id, summary: value.summary, updatedAt: value.updatedAt })
        else broken.push({ id: String(key), broken: true })
    }
    good.sort((a, b) => b.updatedAt - a.updatedAt)
    return [...good, ...broken]
}

export async function getMatch(id: string): Promise<MatchRecord | null> {
    try {
        const v = await get(id, store)
        return isRecord(v) ? v : null
    } catch {
        return null
    }
}

/** Throws on storage errors; the caller reports them. */
export async function putMatch(r: MatchRecord): Promise<void> {
    await set(r.id, r, store)
    bumpMatches()
}

export async function deleteMatch(id: string): Promise<void> {
    await del(id, store)
    try { await del(`match-handles:${id}`) } catch { /* nothing stored */ }
    bumpMatches()
}
