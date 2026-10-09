import type { RenderJob } from '../renderJobs'

export type ExportButtonStatus =
    | { kind: 'idle' }
    | { kind: 'running'; percent: number }
    | { kind: 'done' }
    | { kind: 'failed' }

/** How long the Export button keeps saying "ready" / "failed" after a render ends. */
export const SHOW_DONE_MS = 4000

/** What the Export button shows about the render job: a red dot + percentage while running, briefly "ready" / "failed" after. */
export function exportButtonStatus(job: Pick<RenderJob, 'phase' | 'fraction' | 'finishedAt'> | null, now: number): ExportButtonStatus {
    if (!job) return { kind: 'idle' }
    if (job.phase === 'running') return { kind: 'running', percent: Math.min(100, Math.max(0, Math.round(job.fraction * 100))) }
    const recent = job.finishedAt !== null && now - job.finishedAt < SHOW_DONE_MS
    if (!recent) return { kind: 'idle' }
    return job.phase === 'done' ? { kind: 'done' } : { kind: 'failed' }
}
