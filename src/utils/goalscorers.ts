import type { MatchEvent, Team } from '../types'
import { linkedEvents } from './relink'
import { finalScore, formatScore } from './score'

export type Goalscorers = { scoreLine: string; lines: string[] }

/**
 * The final score and who scored: scorers by goals (most first, ties alphabetical), penalties counted as goals and
 * marked, own goals listed last with the team they counted for. Goals without a scorer only count in the score.
 */
export function goalscorers(events: MatchEvent[], teams: Team[]): Goalscorers {
    const linked = linkedEvents(events)
    const named = teams.length >= 2 && teams.slice(0, 2).every((t) => t.name.trim())
    const scoreLine = named ? `${teams[0].name} ${formatScore(finalScore(linked, teams))} ${teams[1].name}` : ''

    const tally = new Map<string, { name: string; goals: number; pens: number }>()
    for (const e of linked) {
        const name = e.scorer?.trim()
        if (e.type !== 'goal' || !name) continue
        const key = name.toLowerCase()
        const t = tally.get(key) ?? { name, goals: 0, pens: 0 }
        t.goals++
        if (e.pen) t.pens++
        tally.set(key, t)
    }
    const lines = [...tally.values()]
        .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
        .map((t) => `${t.name} ${t.goals}${t.pens ? ` (${t.pens} ${t.pens === 1 ? 'pen' : 'pens'})` : ''}`)

    const own = linked.filter((e) => e.type === 'own_goal')
    if (own.length > 0) {
        lines.push(`Own goals: ${own.map((e) => `${e.scorer?.trim() || 'unknown'}${e.team ? ` (for ${e.team})` : ''}`).join(', ')}`)
    }
    return { scoreLine, lines }
}

/** Score line, a blank line, the scorers (for the clipboard). */
export function goalscorersText(events: MatchEvent[], teams: Team[]): string {
    const { scoreLine, lines } = goalscorers(events, teams)
    return [scoreLine ? [scoreLine] : [], lines].filter((b) => b.length > 0).map((b) => b.join('\n')).join('\n\n')
}
