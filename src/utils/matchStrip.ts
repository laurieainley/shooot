import type { MarkerType, MatchEvent, Team } from '../types'
import { eventLabel, isMarker, shortNote } from './eventTypes'
import { stripTick, type StripTick } from './eventStyle'
import { mergeOverlappingGoalSegments } from './highlights'
import { linkedEvents } from './relink'
import { formatHMS } from './timeline'

export type StripFile = { name: string; leftPct: number; widthPct: number }
export type StripSpan = { leftPct: number; widthPct: number }
/** `tick` is how the mark is drawn (lime goal, chalk own goal + label, open ring, grey): kit colours stay on rows and the score badge. */
export type StripEvent = { id: string; leftPct: number; tick: StripTick; label?: string; title: string; kind: MatchEvent['type'] }
export type StripFlag = { id: string; kind: MarkerType; leftPct: number; title: string }
export type MatchStrip = {
    totalSec: number
    files: StripFile[]
    clips: StripSpan[]
    events: StripEvent[]
    /** Kick off / Half time / Final whistle. */
    flags: StripFlag[]
    playheadPct: number
}

export function globalToFileTime(offsets: number[], durations: number[], t: number): { fileIndex: number; timeSec: number } {
    if (durations.length === 0) return { fileIndex: 0, timeSec: 0 }
    if (t <= 0) return { fileIndex: 0, timeSec: 0 }
    for (let i = 0; i < durations.length; i++) {
        if (t < offsets[i] + durations[i]) return { fileIndex: i, timeSec: t - offsets[i] }
    }
    const last = durations.length - 1
    return { fileIndex: last, timeSec: durations[last] }
}

export function buildMatchStrip(args: {
    files: { name: string; durationSec?: number }[]
    cumulativeOffsets: number[]
    events: MatchEvent[]
    teams: Team[]
    currentFileIndex: number
    currentTimeSec: number
    before: number
    after: number
}): MatchStrip {
    const { files, cumulativeOffsets, events, currentFileIndex, currentTimeSec, before, after } = args
    const durations = files.map((f) => f.durationSec ?? 0)
    const totalSec = durations.reduce((a, b) => a + b, 0)
    if (totalSec <= 0) return { totalSec: 0, files: [], clips: [], events: [], flags: [], playheadPct: 0 }
    const pct = (t: number): number => Math.round((Math.min(totalSec, Math.max(0, t)) / totalSec) * 10000) / 100

    const stripFiles = files.map((f, i) => ({ name: f.name, leftPct: pct(cumulativeOffsets[i] ?? 0), widthPct: pct(durations[i]) }))
    const linked = linkedEvents(events)
    const segments = mergeOverlappingGoalSegments(linked, cumulativeOffsets, 0, false, before, after)
    const clips = segments.map((s) => {
        const start = (cumulativeOffsets[s.sourceFileIndex] ?? 0) + s.startTime
        const end = (cumulativeOffsets[s.sourceFileIndex] ?? 0) + s.endTime
        return { leftPct: pct(start), widthPct: Math.round((pct(end) - pct(start)) * 100) / 100 }
    })
    const globalOf = (e: MatchEvent): number => e.globalTimeSec ?? (cumulativeOffsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
    const flags = linked.filter(isMarker).map((e) => ({ id: e.id, kind: e.type, leftPct: pct(globalOf(e)), title: `${eventLabel(e)} ${formatHMS(globalOf(e))}` }))
    const stripEvents = linked.filter((e) => !isMarker(e)).map((e) => {
        const g = (cumulativeOffsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
        const note = shortNote(e.notes)
        return {
            id: e.id,
            leftPct: pct(g),
            ...stripTick(e),
            title: `${formatHMS(g)} ${eventLabel(e)}${e.team ? ` – ${e.team}` : ''}${e.scorer ? ` (${e.scorer})` : ''}${note ? ` — ${note}` : ''}`,
            kind: e.type,
        }
    })
    const playheadPct = pct((cumulativeOffsets[currentFileIndex] ?? 0) + currentTimeSec)
    return { totalSec, files: stripFiles, clips, events: stripEvents, flags, playheadPct }
}
