// The full match export: every loaded file end to end, trimmed to kick-off … final whistle (stream copied).
import type { MatchEvent } from '../types'
import type { Cut } from '../render/types'
import { parseGoProName } from './gopro'
import { finalWhistleSec, kickOffSec } from './matchClock'

export type MatchSpan = { startSec: number; endSec: number; durationSec: number }

/** Kick-off … final whistle on the whole timeline; the start of the first file / the end of the last when not marked. */
export function fullMatchSpan(events: MatchEvent[], offsets: number[], durations: number[]): MatchSpan {
    const total = durations.reduce((a, b) => a + b, 0)
    const startSec = Math.min(total, Math.max(0, kickOffSec(events, offsets)))
    const endSec = Math.min(total, finalWhistleSec(events, offsets) ?? total)
    return { startSec, endSec, durationSec: Math.max(0, endSec - startSec) }
}

/** Cuts for `startSec` … `endSec` (whole timeline; null = to the end): kick-off → end of its file, whole middle files, start of the last → whistle. */
export function fullMatchCuts(durations: number[], startSec: number, endSec: number | null): Cut[] {
    const cuts: Cut[] = []
    let offset = 0
    durations.forEach((d, sourceIndex) => {
        const a = Math.max(startSec, offset)
        const b = Math.min(endSec ?? Infinity, offset + d)
        if (d > 0 && b > a) cuts.push({ sourceIndex, startSec: a - offset, endSec: b - offset })
        offset += d
    })
    return cuts
}

/** Output size estimate: each file's bytes in proportion to the part of it that is used. */
export function estimateBytes(cuts: Cut[], sizes: number[], durations: number[]): number {
    return cuts.reduce((sum, c) => sum + (durations[c.sourceIndex] > 0 ? (sizes[c.sourceIndex] ?? 0) * (c.endSec - c.startSec) / durations[c.sourceIndex] : 0), 0)
}

export function formatBytes(bytes: number): string {
    const gb = bytes / 1024 ** 3
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

/** Phones: warn before writing more than this. */
export const PHONE_SIZE_WARNING = 2 * 1024 ** 3

/**
 * Whole-timeline starts of files that begin a new recording: a GoPro file that is not the next chapter of the one
 * before it, or any join of other files. The camera was stopped there — usually half time.
 */
export function recordingGaps(files: { name: string }[], offsets: number[]): number[] {
    const gaps: number[] = []
    for (let i = 1; i < files.length; i++) {
        const a = parseGoProName(files[i - 1].name)
        const b = parseGoProName(files[i].name)
        const sameRecording = a && b && a.key.slice(2) === b.key.slice(2) && b.chapter === a.chapter + 1
        if (!sameRecording) gaps.push(offsets[i] ?? 0)
    }
    return gaps
}
