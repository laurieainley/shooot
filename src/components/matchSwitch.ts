// Opening, starting and deleting saved matches. Switching never loses the current match: it is saved first.
import { useAppState } from '../state'
import { cancelDetection, getDetectJob } from '../detectJobs'
import { renderJobs } from '../renderJobs'
import { deleteMatch, getMatch, putMatch } from '../files/matchStore'
import { showToast } from '../toasts'
import { flushAutosave } from './matchAutosave'
import { openMatchStore, setOpenMatch } from './openMatch'
import { setRailTab } from './railTab'

export type SwitchBlocker = 'render' | 'detect' | null

/** A running export or Find goals run that switching would stop. */
export function switchBlocker(): SwitchBlocker {
    if (renderJobs().getState().job?.phase === 'running') return 'render'
    const d = getDetectJob()
    if (d.phase === 'running' || d.ballPhase === 'running') return 'detect'
    return null
}

/** The confirmation line for a blocker. */
export function blockerText(b: Exclude<SwitchBlocker, null>): string {
    return b === 'render' ? 'Exporting — switching stops it.' : 'Finding goals — switching stops it.'
}

export function stopBlocker(): void {
    renderJobs().getState().cancel()
    cancelDetection()
}

/** Loads a saved match. False when the record can't be read (the list shows it as broken). */
export async function openMatch(id: string): Promise<boolean> {
    await flushAutosave()
    const rec = await getMatch(id)
    if (!rec) return false
    cancelDetection()
    useAppState.getState().loadMatch(rec.data)
    setOpenMatch(id, rec.files)
    setRailTab('events')
    return true
}

/** Saves the current match (unless told not to), then starts an empty one and opens the New match steps. */
export async function startNewMatch(opts: { flush?: boolean } = {}): Promise<void> {
    if (opts.flush !== false) await flushAutosave()
    cancelDetection()
    const st = useAppState.getState()
    st.newMatch()
    useAppState.setState({ undoStack: [], redoStack: [] })
    setOpenMatch(null)
    useAppState.getState().openPanel('newmatch')
    setRailTab('events')
}

/** Deletes a saved match, with an Undo toast. Deleting the open match starts a new one. */
export async function removeMatch(id: string): Promise<void> {
    const prev = await getMatch(id)
    const wasOpen = openMatchStore.getState().id === id
    await deleteMatch(id)
    if (wasOpen) await startNewMatch({ flush: false })
    if (prev) showToast('Match deleted', { label: 'Undo', run: () => { void putMatch(prev) } })
}
