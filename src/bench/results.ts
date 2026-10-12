// Result shapes of the on-device benchmark page and the text that is copied/shared from it.
export type StageId = 'probe' | 'copy' | 'highlights' | 'reencode1080' | 'reencode4k' | 'graphics'

export type StageResult = {
    stage: StageId
    label: string
    source: string
    status: 'ok' | 'skipped' | 'failed'
    /** Why a stage was skipped. */
    reason?: string
    wallMs?: number
    /** Length of the footage / output the stage handled, seconds. */
    mediaSeconds?: number
    /** Wall time divided by media length (below 1 = faster than real time). */
    timesRealtime?: number
    fps?: number
    outputBytes?: number
    /** Encoder settings the render used, where it reports them. */
    encoder?: Record<string, unknown>
    peakHeapMB?: number | null
    notes?: string[]
    detail?: Record<string, unknown>
    error?: { message: string; name?: string; stack?: string }
}

export const mb = (bytes: number): string => `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`

export function formatResult(r: StageResult): string {
    if (r.status === 'skipped') return `${r.label} [${r.source}]: skipped (${r.reason})`
    if (r.status === 'failed') return `${r.label} [${r.source}]: FAILED ${r.error?.message ?? ''}`
    const parts = [
        r.wallMs !== undefined ? `${(r.wallMs / 1000).toFixed(1)} s` : null,
        r.timesRealtime !== undefined ? `${r.timesRealtime.toFixed(2)}x realtime` : null,
        r.fps !== undefined ? `${r.fps.toFixed(1)} fps` : null,
        r.outputBytes !== undefined ? mb(r.outputBytes) : null,
        r.peakHeapMB ? `heap ${r.peakHeapMB.toFixed(0)} MB` : null,
    ].filter(Boolean)
    return `${r.label} [${r.source}]: ${parts.join(', ')}`
}

export type BenchReport = {
    startedAt: string
    page: string
    device: Record<string, unknown>
    results: StageResult[]
}

export function summaryText(report: BenchReport): string {
    const ua = String((report.device as { userAgent?: string }).userAgent ?? '')
    return [`Shooot bench ${report.startedAt}`, ua, ...report.results.map(formatResult)].join('\n')
}
