import type { MatchEvent } from '../types'
import { eventLabel, isScoring, shortNote } from './eventTypes'
import { wantsReplay } from './replays'
import type { ReplayOptions } from './renderPlan'

function absTime(e: MatchEvent, offsets: number[]): number {
    return (offsets[e.sourceFileIndex ?? 0] || 0) + e.matchTimeSec
}

function scoreTeams(events: MatchEvent[], teamOrder?: string[]): string[] {
    if (teamOrder && teamOrder.length > 0) return teamOrder
    return Array.from(new Set(events.filter((e) => e.team && isScoring(e)).map((e) => e.team!))).sort()
}

function finalScoreLine(events: MatchEvent[], teams: string[]): string[] {
    if (teams.length === 0) return []
    const totals = teams.map((t) => events.filter((e) => isScoring(e) && e.team === t).length)
    const line = teams.map((t, i) => (i === 0 ? `${t} ${totals[i]}` : `${totals[i]} ${t}`)).join('-')
    return [line, '', '']
}

function chapterLabel(e: MatchEvent, teams: string[], running: Record<string, number>): string {
    let label = eventLabel(e)
    if (isScoring(e)) {
        if (e.team) running[e.team] = (running[e.team] ?? 0) + 1
        if (teams.length > 0) label += ` ${teams.map((t) => running[t] ?? 0).join('-')}`
    }
    if (e.team) label += ` (${e.team})`
    if (e.scorer) label += ` ${e.scorer}`
    const note = shortNote(e.notes)
    if (note) label += `: ${note}`
    return label
}

export function generateYouTubeChapters(
    goals: MatchEvent[], cumulativeOffsets: number[] = [], matchStartTimeSec: number = 0,
    lengthBeforeGoalSec: number = 10, _lengthAfterGoalSec: number = 4, teamOrder?: string[],
): string {
    const hasVideoFiles = cumulativeOffsets.length > 0
    const allFromFirstVideo = goals.every((g) => (g.sourceFileIndex ?? 0) === 0)
    if (!hasVideoFiles && !allFromFirstVideo) return 'Load video files to see timestamps'

    const sorted = [...goals].sort((a, b) => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets))
    const teams = scoreTeams(goals, teamOrder)
    const running: Record<string, number> = {}
    const lines = [...finalScoreLine(goals, teams), '00:00 Start']
    for (const g of sorted) {
        const stamp = secondsToStamp(Math.max(0, Math.floor(absTime(g, cumulativeOffsets) - matchStartTimeSec - lengthBeforeGoalSec)))
        lines.push(`${stamp} ${chapterLabel(g, teams, running)}`)
    }
    return lines.join('\n')
}

export function generateHighlightChapters(
    goals: MatchEvent[], cumulativeOffsets: number[] = [], lengthBeforeGoalSec: number = 10,
    lengthAfterGoalSec: number = 4, teamOrder?: string[], replay?: ReplayOptions,
): string {
    if (goals.length === 0) return '00:00 Start'
    const sorted = [...goals].sort((a, b) => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets))
    const teams = scoreTeams(goals, teamOrder)
    const running: Record<string, number> = {}
    const lines = finalScoreLine(goals, teams)
    const segmentLength = lengthBeforeGoalSec + lengthAfterGoalSec
    let extra = 0 // seconds added by earlier replays
    sorted.forEach((g, i) => {
        lines.push(`${secondsToStamp(i * (segmentLength + 1) + extra)} ${chapterLabel(g, teams, running)}`)
        if (replay && wantsReplay(g)) extra += Math.round((replay.beforeSec + replay.afterSec) / replay.speed)
    })
    return lines.join('\n')
}

function secondsToStamp(s: number): string {
    const totalSeconds = Math.floor(s)
    const hh = Math.floor(totalSeconds / 3600)
    const mm = Math.floor((totalSeconds % 3600) / 60)
    const ss = totalSeconds % 60

    if (hh > 0) {
        return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
    } else {
        return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
    }
}


