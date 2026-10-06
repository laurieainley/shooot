import type { CropRect, EventType, GoalAreas, GoalTeam, MatchEvent, Team } from '../types'
import { clampRect, isFullFrame } from './crop'
import { halfTimeSec } from './matchClock'
import { linkedEvents } from './relink'
import type { ReplayOptions } from './renderPlan'

export type AttackContext = {
    events: MatchEvent[]
    teams: Team[]
    cumulativeOffsets: number[]
    areas: GoalAreas | null
}

const absTime = (e: Pick<MatchEvent, 'matchTimeSec' | 'sourceFileIndex' | 'globalTimeSec'>, offsets: number[]): number =>
    e.globalTimeSec ?? (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec

const OTHER: Record<GoalTeam, GoalTeam> = { team1: 'team2', team2: 'team1' }

/**
 * Which goal a replay of this event zooms to by default: 'team1' / 'team2' = the goal that team defends (each box is
 * the goal its team defends at kick-off), 'full' = the whole frame (location unknown).
 * Goals, penalties and own goals credit the attacking team: the goal is the one the other team defends.
 * A save credits the saving team: its own goal. Fouls and highlights have no known location.
 * After a Half time marker the teams have swapped ends, so each team's goal is the other box.
 * `timeSec` is the event's time on the whole timeline; `halfTimeSec` is null when there is no Half time marker.
 */
export function replayGoalFor(
    e: { type: EventType; team?: string; timeSec: number },
    teams: Team[],
    halfTimeSec: number | null,
): GoalTeam | 'full' {
    const idx = e.team ? teams.findIndex((t) => t.name === e.team) : -1
    if (idx < 0 || idx > 1) return 'full'
    const team: GoalTeam = idx === 0 ? 'team1' : 'team2'
    let defending: GoalTeam
    switch (e.type) {
        case 'goal': case 'own_goal': case 'penalty_awarded': case 'penalty_missed': defending = OTHER[team]; break
        case 'save': defending = team; break
        default: return 'full'
    }
    return halfTimeSec !== null && e.timeSec >= halfTimeSec ? OTHER[defending] : defending
}

/** "Whites' goal", "Colours' goal", "Team 1's goal" when the team has no name yet. */
export function teamGoalLabel(teams: Team[], goal: GoalTeam): string {
    const i = goal === 'team1' ? 0 : 1
    const name = teams[i]?.name.trim() || `Team ${i + 1}`
    return `${name}${/s$/i.test(name) ? "'" : "'s"} goal`
}

/** The crop a replay of `e` uses: its own choice, else the goal for its type. null = the whole frame. */
export function replayCropResolver(ctx: AttackContext): (e: MatchEvent) => CropRect | null {
    const half = halfTimeSec(linkedEvents(ctx.events), ctx.cumulativeOffsets)
    return (e) => {
        const c = e.replayCrop
        let rect: CropRect | null
        if (typeof c === 'object' && c) rect = clampRect(c)
        else if (c === 'full') rect = null
        else {
            const goal = c === 'team1' || c === 'team2' ? c : replayGoalFor({ type: e.type, team: e.team, timeSec: absTime(e, ctx.cumulativeOffsets) }, ctx.teams, half)
            rect = goal === 'full' ? null : ctx.areas?.[goal] ?? null
        }
        return rect && !isFullFrame(rect) ? rect : null
    }
}

export type ReplayState = {
    replayBeforeSec: number
    replayAfterSec: number
    replaySpeed: number
    events: MatchEvent[]
    teams: Team[]
    cumulativeOffsets: number[]
    goalAreas?: GoalAreas | null
}

/** Replay timing, speed and framing from the project: the one place the render and the preview get them. */
export function replayOptionsFor(s: ReplayState): ReplayOptions {
    return {
        beforeSec: s.replayBeforeSec, afterSec: s.replayAfterSec, speed: s.replaySpeed,
        cropFor: replayCropResolver({ events: s.events, teams: s.teams, cumulativeOffsets: s.cumulativeOffsets, areas: s.goalAreas ?? null }),
    }
}
