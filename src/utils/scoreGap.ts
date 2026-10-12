import type { Team } from '../types'
import type { Score } from './score'

/** How the goals tagged so far compare with the final score the user knows. */
export interface ScoreGap {
    /** Goals still to find, per team (known − tagged, never below 0). */
    missing: Score
    /** Goals tagged beyond the known score, per team. */
    extra: Score
    /** Tagged equals known. */
    complete: boolean
}

/** Tagged (from `finalScore()`) against the known final score; null when no score is known. */
export function scoreGap(tagged: Score, known: Score | null): ScoreGap | null {
    if (!known) return null
    return {
        missing: [Math.max(0, known[0] - tagged[0]), Math.max(0, known[1] - tagged[1])],
        extra: [Math.max(0, tagged[0] - known[0]), Math.max(0, tagged[1] - known[1])],
        complete: tagged[0] === known[0] && tagged[1] === known[1],
    }
}

const total = ([a, b]: Score): number => a + b
const teamName = (teams: Team[], i: 0 | 1): string => teams[i]?.name?.trim() || `Team ${i + 1}`

/** "Whites 2, Colours 1" (only teams with a count). */
function byTeam(counts: Score, teams: Team[], withCount: boolean): string {
    return ([0, 1] as const).filter((i) => counts[i] > 0).map((i) => (withCount ? `${teamName(teams, i)} ${counts[i]}` : teamName(teams, i))).join(', ')
}

/** "3 to find" (tally). */
export function toFindText(gap: ScoreGap): string {
    return `${total(gap.missing)} to find`
}

/** "3 goals not found (Whites 2, Colours 1)" (summary, no full stop). */
export function missingText(gap: ScoreGap, teams: Team[]): string {
    const n = total(gap.missing)
    return `${n} ${n === 1 ? 'goal' : 'goals'} not found (${byTeam(gap.missing, teams, true)})`
}

/** "1 more than the final score (Whites)"; counts are added when both teams are over. */
export function extraText(gap: ScoreGap, teams: Team[]): string {
    const both = gap.extra[0] > 0 && gap.extra[1] > 0
    return `${total(gap.extra)} more than the final score (${byTeam(gap.extra, teams, both)})`
}
