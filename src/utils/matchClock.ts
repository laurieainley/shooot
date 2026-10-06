import type { MarkerType, MatchEvent } from '../types'
import { globalToFileTime } from './matchStrip'

/** Where a marker sits on the whole timeline (seconds), or null when there is none (or its file is missing). */
export function markerGlobalSec(events: MatchEvent[], offsets: number[], type: MarkerType): number | null {
    const e = events.find((x) => x.type === type && !x.unlinked)
    if (!e) return null
    if (e.globalTimeSec !== undefined) return e.globalTimeSec
    return (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
}

/** Kick-off on the whole timeline; 0 (start of the first file) when it is not marked. */
export function kickOffSec(events: MatchEvent[], offsets: number[]): number {
    return markerGlobalSec(events, offsets, 'kick_off') ?? 0
}

/** Final whistle on the whole timeline, or null when it is not marked. */
export function finalWhistleSec(events: MatchEvent[], offsets: number[]): number | null {
    return markerGlobalSec(events, offsets, 'final_whistle')
}

/**
 * The old Match setup start time becomes a Kick off event. Files are not known yet, so it keeps its time on the
 * whole timeline (`globalTimeSec`) until loaded files cover it (see resolveGlobalEvents).
 */
export function withMigratedKickOff(events: MatchEvent[], matchStartSec: number): MatchEvent[] {
    if (!(matchStartSec > 0) || events.some((e) => e.type === 'kick_off')) return events
    return [...events, { id: `kickoff-${Math.round(matchStartSec)}`, type: 'kick_off', matchTimeSec: matchStartSec, sourceFileIndex: 0, globalTimeSec: matchStartSec }]
}

/** Places events that only know their whole-timeline time into a file once every loaded file's length is known and they reach it. */
export function resolveGlobalEvents(events: MatchEvent[], files: { name?: string; durationSec?: number }[]): MatchEvent[] {
    if (!events.some((e) => e.globalTimeSec !== undefined)) return events
    if (files.length === 0 || files.some((f) => !(f.durationSec && f.durationSec > 0))) return events
    const durations = files.map((f) => f.durationSec!)
    const offsets: number[] = []
    durations.reduce((acc, d) => { offsets.push(acc); return acc + d }, 0)
    const total = durations.reduce((a, b) => a + b, 0)
    return events.map((e) => {
        if (e.globalTimeSec === undefined || e.globalTimeSec >= total) return e
        const { fileIndex, timeSec } = globalToFileTime(offsets, durations, e.globalTimeSec)
        const next: MatchEvent = { ...e, sourceFileIndex: fileIndex, matchTimeSec: timeSec }
        delete next.globalTimeSec
        delete next.sourceFileKey
        return next
    })
}
