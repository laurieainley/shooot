import type { MarkerType, MatchEvent, Team } from '../types'
import { eventTone, type EventTone } from './eventStyle'
import { eventIcon, eventLabel, isMarker, shortNote } from './eventTypes'
import { linkedEvents } from './relink'
import { formatHMS } from './timeline'

export type Marker = {
    id: string
    kind: 'event' | MarkerType
    leftPct: number
    icon: string
    /** How the scrubber draws it: lime goal tick, chalk own goal, grey tick, or a chalk flag. Never the team's kit colour. */
    tone: EventTone
    title: string
}

export function startInFile(matchStartSec: number, cumulativeOffsets: number[], fileIndex: number, durationSec: number): number | null {
    const local = matchStartSec - (cumulativeOffsets[fileIndex] ?? 0)
    return local >= 0 && local < durationSec ? local : null
}

export function markersForFile(args: {
    events: MatchEvent[]
    fileIndex: number
    durationSec: number
    teams: Team[]
    cumulativeOffsets: number[]
}): Marker[] {
    const { events, fileIndex, durationSec } = args
    if (!durationSec) return []
    const pct = (t: number): number => Math.min(100, Math.max(0, (t / durationSec) * 100))
    const inFile = linkedEvents(events).filter((e) => e.globalTimeSec === undefined && (e.sourceFileIndex ?? 0) === fileIndex)
    // Flags first so event markers draw on top of them.
    const out: Marker[] = inFile.filter(isMarker).map((e) => ({
        id: e.id, kind: e.type, leftPct: pct(e.matchTimeSec), icon: eventIcon(e), tone: eventTone(e),
        title: `${eventLabel(e)} ${formatHMS(e.matchTimeSec)}`,
    }))
    for (const e of inFile) {
        if (isMarker(e)) continue
        const who = e.team ? ` – ${e.team}${e.scorer ? ` (${e.scorer})` : ''}` : e.scorer ? ` – ${e.scorer}` : ''
        const note = shortNote(e.notes)
        out.push({
            id: e.id,
            kind: 'event',
            leftPct: pct(e.matchTimeSec),
            icon: eventIcon(e),
            tone: eventTone(e),
            title: `${formatHMS(e.matchTimeSec)} ${eventLabel(e)}${who}${note ? ` — ${note}` : ''}`,
        })
    }
    return out
}

export function homeTarget(currentSec: number, startSec: number | null): number {
    return startSec !== null && currentSec > startSec + 0.5 ? startSec : 0
}

/** Where watching an event starts: markers at themselves, other events at the start of their clip. */
export function watchFromSec(e: Pick<MatchEvent, 'type' | 'matchTimeSec'>, beforeSec: number): number {
    return isMarker(e) ? e.matchTimeSec : Math.max(0, e.matchTimeSec - beforeSec)
}
