// Which saved match is open in this tab, and the videos it expects. A tiny vanilla store, outside `vhm-state`.
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { FileMeta } from '../utils/matchRecord'

export interface OpenMatchState { id: string | null; files: FileMeta[]; saveError: boolean }

const KEY = 'shooot-open-match'

export function readOpenMatchId(): string | null {
    try { return localStorage.getItem(KEY) || null } catch { return null }
}

export const openMatchStore: StoreApi<OpenMatchState> = createStore<OpenMatchState>(() => ({ id: readOpenMatchId(), files: [], saveError: false }))

export function useOpenMatch<T>(sel: (s: OpenMatchState) => T): T {
    return useStore(openMatchStore, sel)
}

export function setOpenMatch(id: string | null, files: FileMeta[] = []): void {
    try {
        if (id) localStorage.setItem(KEY, id)
        else localStorage.removeItem(KEY)
    } catch { /* storage unavailable: the match is still open in this tab */ }
    openMatchStore.setState({ id, files })
}

// The Matches list reloads when this changes (after every put / delete).
const versionStore = createStore<{ version: number }>(() => ({ version: 0 }))
export function bumpMatches(): void { versionStore.setState((s) => ({ version: s.version + 1 })) }
export function useMatchesVersion(): number { return useStore(versionStore, (s) => s.version) }
