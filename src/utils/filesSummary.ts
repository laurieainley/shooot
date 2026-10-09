import type { VideoSourceFile } from '../types'
import { formatHMS } from './timeline'

export interface FilesSummary {
    count: number
    totalSec: number
    /** Why the Files button shows a warning dot: files that can't play here, or proxies with no full file yet. */
    attention: string[]
    /** `4 files · 56:34`, `1 file · 12:03`, or `No files`. */
    label: string
}

/** The top bar's Files button: count + total duration, and what needs attention. */
export function filesSummary(files: Pick<VideoSourceFile, 'durationSec' | 'kind' | 'fullFile' | 'playbackIssue'>[]): FilesSummary {
    const totalSec = files.reduce((sum, f) => sum + (f.durationSec ?? 0), 0)
    const attention: string[] = []
    const unplayable = files.filter((f) => f.playbackIssue).length
    const previewOnly = files.filter((f) => f.kind === 'proxy' && !f.fullFile).length
    if (unplayable) attention.push(`${unplayable} can't play here`)
    if (previewOnly) attention.push(`${previewOnly} ${previewOnly === 1 ? 'is' : 'are'} preview only (add the full file to render)`)
    const count = files.length
    const label = count === 0 ? 'No files' : `${count} ${count === 1 ? 'file' : 'files'}${totalSec > 0 ? ` · ${formatHMS(totalSec)}` : ''}`
    return { count, totalSec, attention, label }
}
