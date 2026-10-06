import type { MatchEvent, Team } from '../types'
import { kickOffSec, matchMinute } from './matchClock'
import { linkedEvents } from './relink'
import { finalScore, formatScore } from './score'

export type Goalscorers = { scoreLine: string; lines: string[] }

const absTime = (e: MatchEvent, offsets: number[]): number => e.globalTimeSec ?? (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec

/**
 * The final score and who scored: `Name: 2 ('13, '44)`, most goals first (ties alphabetical), penalties marked
 * (`'44 pen`), then `Own goals: Ade ('30, for Whites)`. Minutes come from the match clock (kick-off = minute 1).
 * Goals without a scorer only count in the score.
 */
export function goalscorers(events: MatchEvent[], teams: Team[], cumulativeOffsets: number[] = []): Goalscorers {
    const linked = linkedEvents(events)
    const named = teams.length >= 2 && teams.slice(0, 2).every((t) => t.name.trim())
    const scoreLine = named ? `${teams[0].name} ${formatScore(finalScore(linked, teams))} ${teams[1].name}` : ''
    const kickOff = kickOffSec(linked, cumulativeOffsets)
    const minute = (e: MatchEvent): number => matchMinute(absTime(e, cumulativeOffsets), kickOff)
    const byTime = (a: MatchEvent, b: MatchEvent): number => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets)

    const tally = new Map<string, { name: string; goals: string[] }>()
    for (const e of [...linked].sort(byTime)) {
        const name = e.scorer?.trim()
        if (e.type !== 'goal' || !name) continue
        const key = name.toLowerCase()
        const t = tally.get(key) ?? { name, goals: [] }
        t.goals.push(`'${minute(e)}${e.pen ? ' pen' : ''}`)
        tally.set(key, t)
    }
    const lines = [...tally.values()]
        .sort((a, b) => b.goals.length - a.goals.length || a.name.localeCompare(b.name))
        .map((t) => `${t.name}: ${t.goals.length} (${t.goals.join(', ')})`)

    const own = linked.filter((e) => e.type === 'own_goal').sort(byTime)
    if (own.length > 0) {
        lines.push(`Own goals: ${own.map((e) => `${e.scorer?.trim() || 'unknown'} ('${minute(e)}${e.team ? `, for ${e.team}` : ''})`).join(', ')}`)
    }
    return { scoreLine, lines }
}

/** Score line, a blank line, the scorers (for the clipboard). */
export function goalscorersText(events: MatchEvent[], teams: Team[], cumulativeOffsets: number[] = []): string {
    const { scoreLine, lines } = goalscorers(events, teams, cumulativeOffsets)
    return [scoreLine ? [scoreLine] : [], lines].filter((b) => b.length > 0).map((b) => b.join('\n')).join('\n\n')
}
