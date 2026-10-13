// Autosave for the open match: a debounced write of the record-relevant slice of the store into IndexedDB.
import { useAppState, type AppState } from '../state'
import { adoptLegacyHandles } from '../files/handleStore'
import { getMatch, putMatch } from '../files/matchStore'
import { buildRecord, isWorthSaving, newMatchId, sameRecordData, type RecordSource } from '../utils/matchRecord'
import { openMatchStore, setOpenMatch } from './openMatch'

export interface Autosaver { schedule(): void; flush(): Promise<void>; stop(): void }

const DELAY_MS = 1000

/** The slice of the store that `buildRecord` needs. */
export function recordSource(s: AppState): RecordSource {
    return {
        events: s.events, teams: s.teams,
        lengthBeforeGoalSec: s.lengthBeforeGoalSec, lengthAfterGoalSec: s.lengthAfterGoalSec,
        replayBeforeSec: s.replayBeforeSec, replayAfterSec: s.replayAfterSec, replaySpeed: s.replaySpeed,
        graphics: s.graphics, fullMatch: s.fullMatch, matchdayLabel: s.matchdayLabel,
        goalAreas: s.goalAreas, goalMarks: s.goalMarks, knownFinalScore: s.knownFinalScore,
        suggestions: s.suggestions, suggestionRun: s.suggestionRun, clipOptions: s.clipOptions,
        files: s.files.map((f) => ({ name: f.name, file: f.fullFile ?? f.file, durationSec: f.durationSec, recordedAtMs: f.recordedAtMs })),
    }
}

/** Fields whose change is worth a save (reference compare). */
const WATCHED: (keyof AppState)[] = [
    'events', 'teams', 'files', 'lengthBeforeGoalSec', 'lengthAfterGoalSec', 'replayBeforeSec', 'replayAfterSec', 'replaySpeed',
    'graphics', 'fullMatch', 'clipOptions', 'matchdayLabel', 'knownFinalScore', 'goalAreas', 'goalMarks', 'suggestions', 'suggestionRun',
]

export function shouldSchedule(next: AppState, prev: AppState): boolean {
    return WATCHED.some((k) => next[k] !== prev[k])
}

export function createAutosaver(deps: { now?: () => number; rand?: () => number; delayMs?: number } = {}): Autosaver {
    const now = deps.now ?? Date.now
    const rand = deps.rand ?? Math.random
    const delay = deps.delayMs ?? DELAY_MS
    let timer: ReturnType<typeof setTimeout> | null = null
    let queue: Promise<void> = Promise.resolve()

    const write = async (): Promise<void> => {
        const state = useAppState.getState()
        if (!isWorthSaving(state)) return
        try {
            const id = openMatchStore.getState().id ?? newMatchId(now(), rand)
            const prev = await getMatch(id)
            const rec = buildRecord(recordSource(state), id, now(), prev)
            if (openMatchStore.getState().id !== id) setOpenMatch(id, rec.files)
            if (prev && sameRecordData(prev, rec)) { openMatchStore.setState({ saveError: false }); return }
            await putMatch(rec)
            openMatchStore.setState({ files: rec.files, saveError: false })
        } catch {
            openMatchStore.setState({ saveError: true }) // reported quietly in the Matches tab; tagging carries on
        }
    }

    const clear = (): void => { if (timer) { clearTimeout(timer); timer = null } }
    const flush = (): Promise<void> => {
        clear()
        queue = queue.then(write)
        return queue
    }
    return {
        schedule() { clear(); timer = setTimeout(() => { timer = null; void flush() }, delay) },
        flush,
        stop: clear,
    }
}

let appSaver: Autosaver | null = null

/** Starts the app-wide autosaver (replacing any earlier one). */
export function startAppAutosaver(): Autosaver {
    appSaver?.stop()
    appSaver = createAutosaver()
    return appSaver
}

export function stopAppAutosaver(saver: Autosaver): void {
    saver.stop()
    if (appSaver === saver) appSaver = null
}

/** Flushes the app-wide autosaver; a no-op before it starts. */
export function flushAutosave(): Promise<void> {
    return appSaver ? appSaver.flush() : Promise.resolve()
}

/** Upgrade: with no open match and something worth keeping, the current state becomes the first record. */
export async function adoptCurrentMatch(): Promise<void> {
    if (openMatchStore.getState().id) return
    if (!isWorthSaving(useAppState.getState())) return
    await createAutosaver().flush()
    const id = openMatchStore.getState().id
    if (id) await adoptLegacyHandles(id)
}
