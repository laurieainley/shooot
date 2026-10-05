import type { MatchEvent } from '../types'
import { eventLabel, isMarker, isScoring, shortNote } from './eventTypes'
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

    const sorted = goals.filter((g) => !isMarker(g)).sort((a, b) => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets))
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
    goals = goals.filter((g) => !isMarker(g))
    if (goals.length === 0) return '00:00 Start'
    const teams = scoreTeams(goals, teamOrder)
    return [...finalScoreLine(goals, teams), ...highlightChapterLines(goals, cumulativeOffsets, lengthBeforeGoalSec, lengthAfterGoalSec, teamOrder, replay)].join('\n')
}

/**
 * Chapter lines of the highlights reel (no score header). `offsetSec` (a title card) delays every chapter but the
 * first, which YouTube needs at 00:00.
 */
export function highlightChapterLines(
    goals: MatchEvent[], cumulativeOffsets: number[], lengthBeforeGoalSec: number, lengthAfterGoalSec: number,
    teamOrder?: string[], replay?: ReplayOptions, offsetSec = 0,
): string[] {
    goals = goals.filter((g) => !isMarker(g))
    const sorted = [...goals].sort((a, b) => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets))
    const teams = scoreTeams(goals, teamOrder)
    const running: Record<string, number> = {}
    const lines: string[] = []
    const segmentLength = lengthBeforeGoalSec + lengthAfterGoalSec
    let extra = 0 // seconds added by earlier replays
    sorted.forEach((g, i) => {
        const at = i === 0 ? 0 : i * (segmentLength + 1) + extra + offsetSec
        lines.push(`${secondsToStamp(at)} ${chapterLabel(g, teams, running)}`)
        if (replay && wantsReplay(g)) extra += Math.round((replay.beforeSec + replay.afterSec) / replay.speed)
    })
    return lines
}

/**
 * Chapter lines of the full match video, which starts at kick-off (after an optional title card of `offsetSec`):
 * "00:00 Kick off", then every event from kick-off to the final whistle, a little before it happens.
 */
export function matchChapterLines(
    events: MatchEvent[], cumulativeOffsets: number[], kickOffSec: number, finalWhistleSec: number | null,
    lengthBeforeGoalSec: number, teamOrder?: string[], offsetSec = 0,
): string[] {
    const inMatch = events
        .filter((e) => !isMarker(e))
        .filter((e) => { const t = absTime(e, cumulativeOffsets); return t >= kickOffSec && (finalWhistleSec === null || t <= finalWhistleSec) })
        .sort((a, b) => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets))
    const teams = scoreTeams(events.filter((e) => !isMarker(e)), teamOrder)
    const running: Record<string, number> = {}
    const lines = ['00:00 Kick off']
    for (const e of inMatch) {
        const at = Math.max(0, Math.floor(absTime(e, cumulativeOffsets) - kickOffSec - lengthBeforeGoalSec)) + offsetSec
        lines.push(`${secondsToStamp(at)} ${chapterLabel(e, teams, running)}`)
    }
    return lines
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


