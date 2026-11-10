// "Save prepared parts": one `.shooot-parts` file (bundle.ts) for the other device. Chrome on Android and the Mac ask where to save it
// (showSaveFilePicker); Safari downloads it (Save to Files → the card). The file is a Blob over the cache's own files, so while it is
// written the preparer stays stopped and Render is blocked (the cache has no pin: a part trimmed meanwhile would break the file).
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { CacheKind } from '../render/unitCache'
import { buildBundle } from './bundle'
import { holdPreparer } from './control'

export type PartsSaveState =
    | { phase: 'idle' }
    | { phase: 'saving' }
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
const downloadText = (name: string): string => `Downloading ${name}. On iPhone or iPad: Save to Files, then the card. Add it with the match videos on the other device.`

let lastUrl: string | null = null

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
            if (lastUrl) URL.revokeObjectURL(lastUrl)
            const url = URL.createObjectURL(blob)
            lastUrl = url
            const a = document.createElement('a')
            a.href = url
            a.download = o.name
            a.click()
            set({ phase: 'saved', text: downloadText(o.name), url, name: o.name })
        }
    } catch (e) {
        set({ phase: 'failed', text: e instanceof Error ? e.message : String(e) })
    } finally {
        hold.release()
    }
}
