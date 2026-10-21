import { useEffect, useState } from 'react'
import { useRenderJobs } from '../renderJobs'
import { exportButtonStatus, SHOW_DONE_MS, type ExportButtonStatus } from '../utils/exportButton'

/** The render job as the Export button shows it: percentage while running, briefly "ready" / "failed" after (re-evaluated when that window ends). */
export function useExportButtonStatus(): ExportButtonStatus {
    const job = useRenderJobs((s) => s.job)
    const queued = useRenderJobs((s) => s.queued)
    const [, tick] = useState(0)
    const finishedAt = job?.finishedAt ?? null
    useEffect(() => {
        if (finishedAt === null) return
        const left = finishedAt + SHOW_DONE_MS - Date.now()
        if (left <= 0) return
        const t = setTimeout(() => tick((n) => n + 1), left + 20)
        return () => clearTimeout(t)
    }, [finishedAt])
    return queued ? { kind: 'waiting' } : exportButtonStatus(job, Date.now())
}
