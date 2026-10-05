import { useEffect, useState } from 'react'
import { discardJob, loadJob, type JobKind, type JobState } from '../render/renderJob'

/** An unfinished render of this kind saved by an earlier session (re-read whenever a render stops). */
export function useSavedJob(kind: JobKind, busy: boolean): { job: JobState | null; discard: () => Promise<void> } {
    const [job, setJob] = useState<JobState | null>(null)
    useEffect(() => {
        if (busy) { setJob(null); return }
        let live = true
        void loadJob().then((j) => { if (live) setJob(j && j.kind === kind && j.unitsDone > 0 ? j : null) })
        return () => { live = false }
    }, [kind, busy])
    const discard = async (): Promise<void> => { await discardJob(); setJob(null) }
    return { job, discard }
}
