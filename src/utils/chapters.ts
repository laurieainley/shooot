import type { Goal } from '../types'

export function generateYouTubeChapters(goals: Goal[], cumulativeOffsets: number[] = []): string {
    const sorted = [...goals].sort((a, b) => {
        const aAbs = (cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec
        const bAbs = (cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec
        return aAbs - bAbs
    })

    // Get all unique teams that appear in any goal (to ensure we show all teams in score)
    const allTeams = Array.from(new Set(goals.filter(g => g.team).map(g => g.team!))).sort()

    // Track cumulative scores for all teams
    const teamScores: Record<string, number> = {}
    // Initialize all teams with 0 score
    allTeams.forEach(team => {
        teamScores[team] = 0
    })

    const lines: string[] = []

    // Add final score at the top if we have teams
    if (allTeams.length > 0) {
        // Calculate final scores by counting all goals for each team
        const finalScores: Record<string, number> = {}
        allTeams.forEach(team => {
            finalScores[team] = goals.filter(g => g.team === team).length
        })

        // Format as "Team 1 X - Y Team 2"
        const scoreDisplay = allTeams.map((team, index) => {
            if (index === 0) {
                return `${team} ${finalScores[team]}`
            } else {
                return `${finalScores[team]} ${team}`
            }
        }).join(' - ')

        lines.push(scoreDisplay)
        lines.push('') // Empty line
        lines.push('') // Second empty line
    }

    lines.push(`00:00 Start`)

    for (const g of sorted) {
        // Update the score for this goal's team
        if (g.team) {
            teamScores[g.team] = (teamScores[g.team] || 0) + 1
        }

        const abs = (cumulativeOffsets[g.sourceFileIndex ?? 0] || 0) + g.matchTimeSec
        const stamp = secondsToStamp(Math.max(0, Math.floor(abs - 10)))

        let label = 'GOAL'

        // Add score if we have teams 
        if (allTeams.length > 0) {
            const scoreString = allTeams.map(team => teamScores[team]).join('-')
            label += ` ${scoreString}`
        }

        // Add team and scorer
        if (g.team) {
            label += ` (${g.team})`
        }
        if (g.scorer) {
            label += ` ${g.scorer}`
        }

        lines.push(`${stamp} ${label}`)
    }
    return lines.join('\n')
}

function secondsToStamp(s: number): string {
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${s % 60}`.padStart(2, '0')
    return `${mm}:${ss}`
}


