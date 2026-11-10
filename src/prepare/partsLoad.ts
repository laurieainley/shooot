// Loading a prepared parts file on the Mac (Add files / drop / the Files sheet): its project (asking first when the open match has other
// events, like a project file), then its parts into the unit cache, with progress and Cancel. Kept outside the UI (like toasts.ts):
// PartsLoadStatus shows it.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useAppState } from '../state'
import { applyTransferPayload } from '../components/applyProject'
import { showToast } from '../toasts'
import { importBundle, readBundleProject } from './bundle'
import { holdPreparer, refreshPreparer } from './control'
import { loadOutcome, needsReplace } from './partsFile'

export type PartsLoadState =
    | { phase: 'idle' }
    | { phase: 'confirm'; device: string; incoming: number; existing: number }
    | { phase: 'loading'; device: string; done: number; total: number }
    | { phase: 'notice'; text: string }

export const partsLoadStore = createStore<PartsLoadState>(() => ({ phase: 'idle' }))
/** Replaces the state (a phase never keeps the fields of the one before). */
const set = (next: PartsLoadState): void => { partsLoadStore.setState(next, true) }
export const usePartsLoad = <T,>(sel: (s: PartsLoadState) => T): T => useStore(partsLoadStore, sel)

let answer: ((a: 'replace' | 'keep' | 'cancel') => void) | null = null
let ctl: AbortController | null = null
let loads = 0

/** How many parts files were loaded in this session (the Export panel reads its estimate again when this moves). */
export const partsLoaded = (): number => loads

export function answerReplace(replace: boolean): void { answer?.(replace ? 'replace' : 'keep') }
/** While asking: load nothing. While copying: stop (the parts already stored stay). */
export function cancelPartsLoad(): void { if (answer) answer('cancel'); else ctl?.abort() }
export function dismissPartsNotice(): void { if (partsLoadStore.getState().phase === 'notice') set({ phase: 'idle' }) }

const say = (text: string): void => set({ phase: 'notice', text })

export async function loadPartsFile(file: File): Promise<void> {
    if (ctl || answer) return // one at a time
    const peek = await readBundleProject(file).catch(() => null)
    if (!peek) { say('This is not a prepared parts file.'); return }
    const { project, device } = peek
    if (project) {
        const existing = useAppState.getState().events
        let choice: 'replace' | 'keep' | 'cancel' = 'replace'
        if (needsReplace(existing, project.events ?? [])) {
            set({ phase: 'confirm', device, incoming: project.events.length, existing: existing.length })
            choice = await new Promise((r) => { answer = r })
            answer = null
        }
        if (choice === 'cancel') { set({ phase: 'idle' }); return }
        if (choice === 'replace') applyTransferPayload(project)
    }
    ctl = new AbortController()
    set({ phase: 'loading', device, done: 0, total: 0 })
    // The Files sheet would hide the progress and the toast.
    if (useAppState.getState().panel === 'files') useAppState.getState().closePanel()
    // The preparer would be encoding the very parts that are arriving: it waits, then plans again with them in the cache.
    const hold = holdPreparer('parts')
    try {
        await hold.idle
        const r = await importBundle(file, (done, total) => set({ phase: 'loading', device, done, total }), ctl.signal)
        if (r.imported > 0) loads++
        const { toast, notice } = loadOutcome(r)
        if (toast) showToast(toast)
        set(notice ? { phase: 'notice', text: notice } : { phase: 'idle' })
    } catch (e) {
        say(e instanceof Error ? e.message : String(e))
    } finally {
        ctl = null
        hold.release()
        refreshPreparer()
    }
}
