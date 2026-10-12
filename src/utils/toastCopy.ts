import { EVENT_META } from './eventTypes'
import { formatClock } from './timeline'
import type { EventType, MatchEvent } from '../types'

const typeLabel = (type: EventType): string => EVENT_META[type].label
const withTeam = (type: EventType, team?: string, scorer?: string): string => [typeLabel(type), team, scorer].filter(Boolean).join(' · ')

/** A moment on the match clock (after Kick off), clamped at 0. */
export function matchClock(globalSec: number, kickOffSec: number, long: boolean): string {
    return formatClock(Math.max(0, globalSec - kickOffSec), long)
}

/** Where an event sits on the whole timeline. */
export function eventGlobalSec(e: Pick<MatchEvent, 'matchTimeSec' | 'sourceFileIndex'>, offsets: readonly number[]): number {
    return (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
}

export const confirmedCopy = (type: EventType, team: string | undefined, clock: string, scorer?: string): string => `${withTeam(type, team, scorer)} confirmed at ${clock}`
export const discardedCopy = (clock: string): string => `Discarded ${clock}`
export const taggedCopy = (type: EventType, team: string | undefined, clock: string): string => `${withTeam(type, team)} tagged at ${clock}`
export const deletedCopy = (type: EventType, clock: string): string => `${typeLabel(type)} at ${clock} deleted`
/** Kick off / Half time / Final whistle: the timeline clock, since the marker itself defines the match clock. */
export const markerSetCopy = (type: EventType, clock: string): string => `${typeLabel(type)} set at ${clock}`
