import type { MatchEvent, Team } from '../types'
import { teamBadge } from '../graphics/teamStyle'
import { linkedEvents } from './relink'
import { finalScore, formatScore } from './score'

export type Goalscorers = { scoreLine: string; lines: string[] }

/**
 * The final score (team abbreviations) and who scored: `Name: 2` (total goals) or `Name: 2 (1 pen)` when some were
 * penalties, most goals first (ties alphabetical), then `Own goals: Ade 1, Jo 1`. No minutes, no assists.
 * Goals without a scorer only count in the score.
 */
export function goalscorers(events: MatchEvent[], teams: Team[]): Goalscorers {
    const linked = linkedEvents(events)
    const named = teams.length >= 2 && teams.slice(0, 2).every((t) => t.name.trim())
    const scoreLine = named ? `${teamBadge(teams[0]).initials} ${formatScore(finalScore(linked, teams))} ${teamBadge(teams[1]).initials}` : ''

    const tally = (nameOf: (e: MatchEvent) => string | undefined): { name: string; goals: number; pens: number }[] => {
        const byName = new Map<string, { name: string; goals: number; pens: number }>()
        for (const e of linked) {
            const name = nameOf(e)
            if (!name) continue
            const key = name.toLowerCase()
            const t = byName.get(key) ?? { name, goals: 0, pens: 0 }
            t.goals += 1
            if (e.pen) t.pens += 1
            byName.set(key, t)
        }
        return [...byName.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    }

    const lines = tally((e) => (e.type === 'goal' ? e.scorer?.trim() : undefined))
        .map((t) => `${t.name}: ${t.goals}${t.pens > 0 ? ` (${t.pens} pen${t.pens > 1 ? 's' : ''})` : ''}`)
    const own = tally((e) => (e.type === 'own_goal' ? e.scorer?.trim() || 'unknown' : undefined))
    if (own.length > 0) lines.push(`Own goals: ${own.map((t) => `${t.name} ${t.goals}`).join(', ')}`)
    return { scoreLine, lines }
}

/** Score line, a blank line, the scorers (for the clipboard). */
export function goalscorersText(events: MatchEvent[], teams: Team[]): string {
    const { scoreLine, lines } = goalscorers(events, teams)
    return [scoreLine ? [scoreLine] : [], lines].filter((b) => b.length > 0).map((b) => b.join('\n')).join('\n\n')
}
