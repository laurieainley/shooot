import type { MatchEvent, Team } from '../types'
import { eventLabel, shortNote } from './eventTypes'
import { mergeOverlappingGoalSegments } from './highlights'
import { linkedEvents } from './relink'
import { formatHMS } from './timeline'

export type StripFile = { name: string; leftPct: number; widthPct: number }
export type StripSpan = { leftPct: number; widthPct: number }
export type StripEvent = { id: string; leftPct: number; color: string; title: string; kind: MatchEvent['type'] }
export type MatchStrip = {
    totalSec: number
    files: StripFile[]
    clips: StripSpan[]
    events: StripEvent[]
    startPct: number | null
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
    matchStartSec: number
    currentFileIndex: number
    currentTimeSec: number
    before: number
    after: number
}): MatchStrip {
    const { files, cumulativeOffsets, events, teams, matchStartSec, currentFileIndex, currentTimeSec, before, after } = args
    const durations = files.map((f) => f.durationSec ?? 0)
    const totalSec = durations.reduce((a, b) => a + b, 0)
    if (totalSec <= 0) return { totalSec: 0, files: [], clips: [], events: [], startPct: null, playheadPct: 0 }
    const pct = (t: number): number => Math.round((Math.min(totalSec, Math.max(0, t)) / totalSec) * 10000) / 100

    const stripFiles = files.map((f, i) => ({ name: f.name, leftPct: pct(cumulativeOffsets[i] ?? 0), widthPct: pct(durations[i]) }))
    const linked = linkedEvents(events)
    const segments = mergeOverlappingGoalSegments(linked, cumulativeOffsets, 0, false, before, after)
    const clips = segments.map((s) => {
        const start = (cumulativeOffsets[s.sourceFileIndex] ?? 0) + s.startTime
        const end = (cumulativeOffsets[s.sourceFileIndex] ?? 0) + s.endTime
        return { leftPct: pct(start), widthPct: Math.round((pct(end) - pct(start)) * 100) / 100 }
    })
    const stripEvents = linked.map((e) => {
        const team = teams.find((t) => t.name === e.team)
        const g = (cumulativeOffsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
        const note = shortNote(e.notes)
        return {
            id: e.id,
            leftPct: pct(g),
            color: team?.color ?? 'var(--muted)',
            title: `${formatHMS(g)} ${eventLabel(e)}${e.team ? ` – ${e.team}` : ''}${e.scorer ? ` (${e.scorer})` : ''}${note ? ` — ${note}` : ''}`,
            kind: e.type,
        }
    })
    const startPct = matchStartSec > 0 && matchStartSec < totalSec ? pct(matchStartSec) : null
    const playheadPct = pct((cumulativeOffsets[currentFileIndex] ?? 0) + currentTimeSec)
    return { totalSec, files: stripFiles, clips, events: stripEvents, startPct, playheadPct }
}
