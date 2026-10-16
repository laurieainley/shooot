import { useEffect } from 'react'
import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { useRenderJobs } from '../renderJobs'
import { endActivity, startActivity } from '../crashNoteRuntime'

const filesNow = (full: boolean) => useAppState.getState().files.flatMap((f) => {
    const file = full ? f.fullFile ?? f.file : f.file
    return file ? [{ name: file.name || f.name, sizeBytes: file.size, codec: f.codec, kind: f.kind }] : []
})

/** Leaves a breadcrumb (utils/crashNote.ts) while Find goals or a render runs, so a reload mid-job can be explained. */
export function useCrashBreadcrumbs(): void {
    const detecting = useDetectJob((s) => s.phase === 'running')
    const ball = useDetectJob((s) => s.ballPhase === 'running')
    const renderKind = useRenderJobs((s) => (s.job?.phase === 'running' ? s.job.kind : null))
    useEffect(() => {
        if (!detecting) return
        startActivity('find-goals', { kind: 'find-goals', files: filesNow(false) })
        return () => endActivity('find-goals')
    }, [detecting])
    useEffect(() => {
        if (!ball) return
        startActivity('ball-check', { kind: 'ball-check', files: filesNow(true) })
        return () => endActivity('ball-check')
    }, [ball])
    useEffect(() => {
        if (!renderKind) return
        startActivity('render', { kind: 'render', label: String(renderKind), files: filesNow(true) })
        return () => endActivity('render')
    }, [renderKind])
}
