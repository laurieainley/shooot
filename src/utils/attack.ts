import type { CropRect, GoalAreas, MatchEvent, Team } from '../types'
import { clampRect, isFullFrame } from './crop'
import { linkedEvents } from './relink'
import type { ReplayOptions } from './renderPlan'

export type Side = 'left' | 'right'

export type AttackContext = {
    events: MatchEvent[]
    teams: Team[]
    cumulativeOffsets: number[]
    /** First half: the first team (Match setup) attacks the goal on the left of the picture. */
    whitesAttackLeft: boolean
    areas: GoalAreas | null
}

const absTime = (e: MatchEvent, offsets: number[]): number => e.globalTimeSec ?? (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec

/**
 * Which goal the credited team attacks when this event happens (own goals are credited to the team that benefits).
 * Teams swap ends at a second Kick off marker (the second half); with a single Kick off nothing swaps.
 */
export function attackingSide(e: Pick<MatchEvent, 'team' | 'matchTimeSec' | 'sourceFileIndex' | 'globalTimeSec'>, ctx: AttackContext): Side | null {
    const team = ctx.teams.findIndex((t) => t.name === e.team)
    if (!e.team || team < 0 || team > 1) return null
    const t = absTime(e as MatchEvent, ctx.cumulativeOffsets)
    const started = linkedEvents(ctx.events).filter((x) => x.type === 'kick_off').map((x) => absTime(x, ctx.cumulativeOffsets)).filter((k) => k <= t).length
    const swapped = started >= 2
    const firstLeft = team === 0 ? ctx.whitesAttackLeft : !ctx.whitesAttackLeft
    return firstLeft !== swapped ? 'left' : 'right'
}

/** The crop a replay of `e` uses: its own choice, else the attacking goal area. null = the whole frame. */
export function replayCropResolver(ctx: AttackContext): (e: MatchEvent) => CropRect | null {
    return (e) => {
        const c = e.replayCrop
        let rect: CropRect | null
        if (typeof c === 'object' && c) rect = clampRect(c)
        else if (c === 'full') rect = null
        else if (c === 'left' || c === 'right') rect = ctx.areas ? ctx.areas[c] : null
        else {
            const side = ctx.areas ? attackingSide(e, ctx) : null
            rect = side && ctx.areas ? ctx.areas[side] : null
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
    whitesAttackLeft?: boolean
    goalAreas?: GoalAreas | null
}

/** Replay timing, speed and framing from the project: the one place the render and the preview get them. */
export function replayOptionsFor(s: ReplayState): ReplayOptions {
    return {
        beforeSec: s.replayBeforeSec, afterSec: s.replayAfterSec, speed: s.replaySpeed,
        cropFor: replayCropResolver({ events: s.events, teams: s.teams, cumulativeOffsets: s.cumulativeOffsets, whitesAttackLeft: s.whitesAttackLeft ?? true, areas: s.goalAreas ?? null }),
    }
}
