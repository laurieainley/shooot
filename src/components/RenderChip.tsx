import { useEffect, useState } from 'react'
import { useAppState } from '../state'
import { useRenderJobs } from '../renderJobs'

interface RenderChipProps {
    /** 'bar': in the top bar; 'overlay': floating over the picture (folded bar, fullscreen). */
    variant?: 'bar' | 'overlay'
}

const SHOW_DONE_MS = 4000

/** "Rendering 42%" while a render runs (anywhere in the app), "Done" briefly after; tap to open Export. */
export function RenderChip({ variant = 'bar' }: RenderChipProps) {
    const job = useRenderJobs((s) => s.job)
    const [, tick] = useState(0)
    const finishedAt = job?.finishedAt ?? null
    useEffect(() => {
        if (finishedAt === null) return
        const left = finishedAt + SHOW_DONE_MS - Date.now()
        if (left <= 0) return
        const t = setTimeout(() => tick((n) => n + 1), left)
        return () => clearTimeout(t)
    }, [finishedAt])
    if (!job) return null
    const recent = finishedAt !== null && Date.now() - finishedAt < SHOW_DONE_MS
    if (job.phase !== 'running' && !recent) return null
    const label = job.phase === 'running' ? `Rendering ${Math.round(job.fraction * 100)}%` : job.phase === 'done' ? 'Done ✓' : 'Render failed'
    const open = (): void => {
        const st = useAppState.getState()
        st.setExportTab(job.kind)
        st.openPanel('export')
    }
    return (
        <button type="button" className={`render-chip render-chip--${variant} render-chip--${job.phase}`} onClick={open}
            aria-label={`${label} — open Export`} title="Open Export">
            {job.phase === 'running' && <span className="render-chip__bar" style={{ width: `${Math.round(job.fraction * 100)}%` }} aria-hidden="true" />}
            <span className="render-chip__text tc">{label}</span>
        </button>
    )
}
