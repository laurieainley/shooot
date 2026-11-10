// "Save prepared parts": one `.shooot-parts` file (bundle.ts) for the other device. Chrome on Android and the Mac ask where to save it
// (showSaveFilePicker); Safari downloads it (Save to Files → the card). The file is a Blob over the cache's own files, so while it is
// written the preparer stays stopped and Render is blocked (the cache has no pin: a part trimmed meanwhile would break the file).
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { CacheKind } from '../render/unitCache'
import { buildBundle } from './bundle'
import { holdPreparer } from './control'
import { formatBytes } from '../utils/fullMatch'

export type PartsSaveState =
    | { phase: 'idle' }
    /** `url`/`name`/`text`: the download has started and the parts are held while Safari reads them. */
    | { phase: 'saving'; text?: string; url?: string; name?: string }
    | { phase: 'saved'; text: string; url?: string; name?: string }
    | { phase: 'failed'; text: string }

export const partsSaveStore = createStore<PartsSaveState>(() => ({ phase: 'idle' }))
/** Replaces the state (a phase never keeps the fields of the one before). */
const set = (next: PartsSaveState): void => { partsSaveStore.setState(next, true) }
export const usePartsSave = <T,>(sel: (s: PartsSaveState) => T): T => useStore(partsSaveStore, sel)
export const isSavingParts = (): boolean => partsSaveStore.getState().phase === 'saving'

type SaveHandle = { name: string; createWritable: () => Promise<WritableStream> }
type SavePicker = (o: object) => Promise<SaveHandle>

const savedText = (name: string): string => `Saved ${name}. Put it on the card with the match videos and add it with them on the other device.`
const downloadingText = (name: string): string => `Downloading ${name}. On iPhone or iPad: Save to Files, then the card. Add it with the match videos on the other device.`
export const DOWNLOAD_STARTED = 'Download started — choose Save to Files, then the card.'

/** Free space the browser reports for this site (null when it will not say). A download is a copy, so the device needs about the file's size. */
async function freeBytes(): Promise<number | null> {
    try {
        const e = await navigator.storage?.estimate?.()
        return e?.quota ? Math.max(0, e.quota - (e.usage ?? 0)) : null
    } catch { return null }
}

let lastUrl: string | null = null

/** After a download starts Safari reads the Blob while the user is in Save to Files: hold at least this long, and until the page is back. */
export const DOWNLOAD_HOLD_MS = 60_000
export const DOWNLOAD_HOLD_MAX_MS = 5 * 60_000

/** Resolves after DOWNLOAD_HOLD_MS, or later when the page was hidden meanwhile and is not visible again yet; never after DOWNLOAD_HOLD_MAX_MS. */
function downloadSettled(): Promise<void> {
    return new Promise((resolve) => {
        let away = typeof document !== 'undefined' && document.visibilityState === 'hidden'
        let minDone = false
        const onVis = (): void => { if (document.visibilityState === 'hidden') away = true; else { away = false; check() } }
        const finish = (): void => { clearTimeout(a); clearTimeout(b); document.removeEventListener('visibilitychange', onVis); resolve() }
        const check = (): void => { if (minDone && !away) finish() }
        document.addEventListener('visibilitychange', onVis)
        const a = setTimeout(() => { minDone = true; check() }, DOWNLOAD_HOLD_MS)
        const b = setTimeout(finish, DOWNLOAD_HOLD_MAX_MS)
    })
}

/** Asks where to save (call it inside the click: the picker opens before anything else), then writes the file. */
export async function savePreparedParts(o: { name: string; projectId: string | null; kinds: CacheKind[] }): Promise<void> {
    if (isSavingParts()) return
    const picker = (globalThis as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
    let handle: SaveHandle | null = null
    if (typeof picker === 'function') {
        try {
            handle = await picker({ suggestedName: o.name, types: [{ description: 'Prepared parts', accept: { 'application/octet-stream': ['.shooot-parts'] } }] })
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return
            set({ phase: 'failed', text: `Could not open the save dialog: ${e instanceof Error ? e.message : String(e)}` })
            return
        }
    }
    set({ phase: 'saving' })
    const hold = holdPreparer('parts')
    try {
        await hold.idle
        const blob = await buildBundle(o.projectId, { kinds: o.kinds })
        if (handle) {
            await blob.stream().pipeTo(await handle.createWritable())
            set({ phase: 'saved', text: savedText(handle.name) })
        } else {
            const free = await freeBytes()
            if (free !== null && free < blob.size * 1.1) { set({ phase: 'failed', text: `Not enough free space on this device to save the file (about ${formatBytes(blob.size)} needed).` }); return }
            if (lastUrl) URL.revokeObjectURL(lastUrl)
            const url = URL.createObjectURL(blob)
            lastUrl = url
            const a = document.createElement('a')
            a.href = url
            a.download = o.name
            a.click()
            set({ phase: 'saving', text: downloadingText(o.name), url, name: o.name })
            await downloadSettled()
            set({ phase: 'saved', text: DOWNLOAD_STARTED, url, name: o.name })
        }
    } catch (e) {
        set({ phase: 'failed', text: e instanceof Error ? e.message : String(e) })
    } finally {
        hold.release()
    }
}
