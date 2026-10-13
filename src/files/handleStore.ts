// File System Access handles (desktop Chrome / Edge) kept in IndexedDB so the match's videos can be reopened after a
// reload with one click (and one permission prompt). Not available on Android Chrome or Safari: there, Relink opens
// the normal picker and events find their files again by name.
import { del, get, set } from 'idb-keyval'
import { VIDEO_EXTENSIONS } from '../utils/fileAccept'
import { openMatchStore } from '../components/openMatch'

const LEGACY_KEY = 'file-handles'

/** Handles belong to the open match; before there is one, the old single list. */
const key = (): string => {
    const id = openMatchStore.getState().id
    return id ? `match-handles:${id}` : LEGACY_KEY
}

export type StoredHandle = FileSystemFileHandle & {
    queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>
    requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>
}

type OpenFilePicker = (options: {
    multiple?: boolean
    types?: { description: string; accept: Record<string, string[]> }[]
    excludeAcceptAllOption?: boolean
}) => Promise<StoredHandle[]>

/** showOpenFilePicker, where the browser has it. */
export function filePicker(): OpenFilePicker | null {
    const w = typeof window !== 'undefined' ? (window as Window & { showOpenFilePicker?: OpenFilePicker }) : null
    return w && typeof w.showOpenFilePicker === 'function' ? w.showOpenFilePicker.bind(w) : null
}

export async function loadHandles(): Promise<StoredHandle[]> {
    try {
        const v = await get<StoredHandle[]>(key())
        return Array.isArray(v) ? v : []
    } catch {
        return []
    }
}

/** Adds handles for this match's files (one per name; a newer pick replaces an older one). */
export async function rememberHandles(handles: StoredHandle[]): Promise<void> {
    if (handles.length === 0) return
    try {
        const byName = new Map((await loadHandles()).map((h) => [h.name, h]))
        for (const h of handles) byName.set(h.name, h)
        await set(key(), [...byName.values()])
    } catch { /* storage unavailable: relinking falls back to the picker */ }
}

export async function clearHandles(): Promise<void> {
    try { await del(key()) } catch { /* nothing stored */ }
}

/** Upgrade: the old single handle list becomes the first match's. */
export async function adoptLegacyHandles(id: string): Promise<void> {
    try {
        const v = await get<StoredHandle[]>(LEGACY_KEY)
        if (Array.isArray(v) && v.length > 0) await set(`match-handles:${id}`, v)
        await del(LEGACY_KEY)
    } catch { /* storage unavailable */ }
}

/** Reopens stored files (asking for read permission once where needed; must run in a click). */
export async function reopenHandles(handles: StoredHandle[]): Promise<{ files: File[]; failed: string[] }> {
    const files: File[] = []
    const failed: string[] = []
    for (const h of handles) {
        try {
            let state = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted'
            if (state !== 'granted') state = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied'
            if (state !== 'granted') { failed.push(h.name); continue }
            files.push(await h.getFile())
        } catch {
            failed.push(h.name) // moved, deleted or the card is out
        }
    }
    return { files, failed }
}

/** Opens the system picker for match videos and remembers the handles. Null when cancelled. */
export async function pickWithHandles(): Promise<File[] | null> {
    const pick = filePicker()
    if (!pick) return null
    try {
        const handles = await pick({ multiple: true, types: [{ description: 'Match videos', accept: { 'video/mp4': VIDEO_EXTENSIONS.filter((e) => !/mov/i.test(e)), 'video/quicktime': ['.mov', '.MOV'] } }] })
        const files = await Promise.all(handles.map((h) => h.getFile()))
        await rememberHandles(handles)
        return files
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null
        throw e
    }
}
