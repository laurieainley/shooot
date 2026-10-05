import type { MatchEvent, Team } from '../types'
import { isScoring } from './eventTypes'
import { linkedEvents } from './relink'

export type Score = [number, number]

function absTime(e: MatchEvent, offsets: number[]): number {
    return (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
}

/** Linked scoring events for one of the first two Match-setup teams, in timeline order. */
function goals(events: MatchEvent[], teams: Team[], offsets: number[]): { e: MatchEvent; side: 0 | 1; t: number }[] {
    if (teams.length < 2) return []
    const out: { e: MatchEvent; side: 0 | 1; t: number }[] = []
    for (const e of linkedEvents(events)) {
        if (!isScoring(e)) continue
        const side = e.team === teams[0].name ? 0 : e.team === teams[1].name ? 1 : -1
        if (side !== -1) out.push({ e, side, t: absTime(e, offsets) })
    }
    return out.sort((a, b) => a.t - b.t)
}

/** Score at a point on the whole timeline (events exactly at `globalTimeSec` count). Own goals go to the credited `team`. */
export function scoreAt(events: MatchEvent[], teams: Team[], cumulativeOffsets: number[], globalTimeSec: number): Score {
    const score: Score = [0, 0]
    for (const g of goals(events, teams, cumulativeOffsets)) if (g.t <= globalTimeSec) score[g.side]++
    return score
}

export function finalScore(events: MatchEvent[], teams: Team[]): Score {
    return scoreAt(events, teams, [], Infinity)
}

/** The score straight after each scoring event, keyed by event id. */
export function scoresAfter(events: MatchEvent[], teams: Team[], cumulativeOffsets: number[]): Map<string, Score> {
    const score: Score = [0, 0]
    const out = new Map<string, Score>()
    for (const g of goals(events, teams, cumulativeOffsets)) {
        score[g.side]++
        out.set(g.e.id, [score[0], score[1]])
    }
    return out
}

export function formatScore([a, b]: Score): string {
    return `${a}–${b}`
}
