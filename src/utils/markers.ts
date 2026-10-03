import type { MatchEvent, Team } from '../types'
import { EVENT_META, eventIcon, eventLabel } from './eventTypes'
import { linkedEvents } from './relink'
import { formatHMS } from './timeline'

export type Marker = {
    id: string
    kind: 'event' | 'start'
    leftPct: number
    icon: string
    color: string
    title: string
}

const START_COLOR = '#22c55e'

export function startInFile(matchStartSec: number, cumulativeOffsets: number[], fileIndex: number, durationSec: number): number | null {
    const local = matchStartSec - (cumulativeOffsets[fileIndex] ?? 0)
    return local >= 0 && local < durationSec ? local : null
}

export function markersForFile(args: {
    events: MatchEvent[]
    fileIndex: number
    durationSec: number
    teams: Team[]
    matchStartSec: number
    cumulativeOffsets: number[]
}): Marker[] {
    const { events, fileIndex, durationSec, teams, matchStartSec, cumulativeOffsets } = args
    if (!durationSec) return []
    const pct = (t: number): number => Math.min(100, Math.max(0, (t / durationSec) * 100))
    const out: Marker[] = []
    const start = startInFile(matchStartSec, cumulativeOffsets, fileIndex, durationSec)
    if (start !== null) out.push({ id: 'start', kind: 'start', leftPct: pct(start), icon: '⚑', color: START_COLOR, title: 'Match start' })
    for (const e of linkedEvents(events)) {
        if ((e.sourceFileIndex ?? 0) !== fileIndex) continue
        const team = teams.find((t) => t.name === e.team)
        const who = e.team ? ` – ${e.team}${e.scorer ? ` (${e.scorer})` : ''}` : ''
        out.push({
            id: e.id,
            kind: 'event',
            leftPct: pct(e.matchTimeSec),
            icon: eventIcon(e),
            color: team?.color ?? EVENT_META[e.type].color,
            title: `${formatHMS(e.matchTimeSec)} ${eventLabel(e)}${who}`,
        })
    }
    return out
}

export function homeTarget(currentSec: number, startSec: number | null): number {
    return startSec !== null && currentSec > startSec + 0.5 ? startSec : 0
}
