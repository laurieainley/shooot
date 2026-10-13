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
    /** Time to hand the finished file to the device (see DeliverTiming); measured after wallMs, so it is not part of it. */
    deliver?: DeliverTiming
    /** Why the save-step timing could not be taken (the stage itself succeeded). */
    deliverError?: string
    notes?: string[]
    detail?: Record<string, unknown>
    error?: { message: string; name?: string; stack?: string }
}

/** The "save to device" step real exports do after rendering, measured without changing the stage's own numbers. */
export type DeliverTiming = {
    /** `new File([output])` + `URL.createObjectURL`, ms. */
    prepareMs: number
    /** Reading the whole output back through its blob URL (what a download does before it writes to disk), ms. */
    readMs: number
    readMBps: number
    /** Clicking a download link for the file, ms (only when the page was told to start real downloads). */
    clickMs?: number
    bytes: number
}

export type ExperimentId = 'parallel' | 'segmentCache' | 'playback' | 'directSave' | 'overlayCache' | 'tightSpans' | 'latency' | 'pipeline' | 'worker' | 'webgpu'

/** One baseline/variant measurement of an experiment. */
export type ExperimentRow = {
    label: string
    baselineName: string
    variantName: string
    baselineMs?: number
    variantMs?: number
    /** Positive = the variant was faster than the baseline. */
    speedupPct?: number
    baselineBytes?: number
    variantBytes?: number
    note?: string
    error?: { message: string; name?: string; stack?: string; which?: 'baseline' | 'variant' }
    detail?: Record<string, unknown>
}

export type ExperimentResult = {
    id: ExperimentId
    /** The number in the brief (1-7, 9, 10, 11). */
    number: number
    name: string
    source: string
    excerptSec: number
    status: 'ok' | 'skipped' | 'failed'
    reason?: string
    rows: ExperimentRow[]
    notes?: string[]
    detail?: Record<string, unknown>
    error?: { message: string; name?: string; stack?: string }
}

export const speedupPct = (baselineMs: number | undefined, variantMs: number | undefined): number | undefined =>
    baselineMs && variantMs !== undefined && baselineMs > 0 ? ((baselineMs - variantMs) / baselineMs) * 100 : undefined

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
    /** Experiments (the /bench "Experiments" section): one entry per experiment that ran. */
    experiments?: ExperimentResult[]
}

const secs = (ms: number | undefined): string => (ms === undefined ? '-' : `${(ms / 1000).toFixed(1)} s`)

/** The compact comparison table as plain rows: experiment, baseline, variant, speed-up %, output size, error. */
export function experimentRows(results: ExperimentResult[]): string[][] {
    const out: string[][] = []
    for (const e of results) {
        if (e.status !== 'ok' && e.rows.length === 0) {
            out.push([`#${e.number} ${e.name}`, '-', '-', '-', '-', e.status === 'failed' ? (e.error?.message ?? 'failed') : `skipped: ${e.reason ?? ''}`])
            continue
        }
        for (const r of e.rows) {
            const size = r.baselineBytes !== undefined || r.variantBytes !== undefined
                ? `${r.baselineBytes !== undefined ? mb(r.baselineBytes) : '-'} / ${r.variantBytes !== undefined ? mb(r.variantBytes) : '-'}` : '-'
            out.push([
                `#${e.number} ${e.name}: ${r.label}`, `${r.baselineName} ${secs(r.baselineMs)}`, `${r.variantName} ${secs(r.variantMs)}`,
                r.speedupPct === undefined ? '-' : `${r.speedupPct >= 0 ? '+' : ''}${r.speedupPct.toFixed(0)}%`, size,
                r.error ? `${r.error.which ?? ''} ${r.error.message}`.trim() : (r.note ?? ''),
            ])
        }
    }
    return out
}

export function summaryText(report: BenchReport): string {
    const ua = String((report.device as { userAgent?: string }).userAgent ?? '')
    const table = experimentRows(report.experiments ?? []).map((r) => r.join(' | '))
    return [`Shooot bench ${report.startedAt}`, ua, ...report.results.map(formatResult), ...(table.length ? ['', 'Experiments (experiment | baseline | variant | speed-up | output size | note):', ...table] : [])].join('\n')
}
