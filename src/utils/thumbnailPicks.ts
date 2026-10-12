import type { MatchEvent, Team } from '../types'
import { eventLabel, isMarker } from './eventTypes'
import { finalWhistleSec, kickOffSec, matchMinute } from './matchClock'
import { clean, shortTitle } from './outputName'
import { linkedEvents } from './relink'

/** The ball crosses the line at the tagged moment; a thumbnail shows the shot slightly before it. */
export const THUMB_LEAD_SEC = 0.25
export const THUMB_FINE_MAX_SEC = 1
export const THUMB_FINE_STEP_SEC = 0.25

export type ThumbnailPick = {
    /** Stable key for the pick. */
    id: string
    event: MatchEvent | null
    fileIndex: number
    /** Seconds into that file for the default frame. */
    timeSec: number
    /** "Goal 2 of 5 · 34' Sam" */
    label: string
}

type FileInfo = { durationSec?: number }

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Frame time of a moment in its file: the moment minus the lead (plus any fine-tuning), kept inside the file. */
export function pickTime(matchTimeSec: number, durationSec: number | undefined, fine = 0): number {
    const t = Math.max(0, matchTimeSec - THUMB_LEAD_SEC + fine)
    return durationSec && durationSec > 0 ? clamp(t, 0, Math.max(0, durationSec - 0.1)) : t
}

/**
 * The frames to choose from, in time order: goals and own goals, else other tagged moments (saves, missed
 * penalties, highlights ...), else a frame from the middle of the match.
 */
export function thumbnailPicks(events: MatchEvent[], offsets: number[], files: FileInfo[]): ThumbnailPick[] {
    if (files.length === 0) return []
    const linked = linkedEvents(events).filter((e) => e.globalTimeSec === undefined)
    const abs = (e: MatchEvent): number => (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
    const byTime = (a: MatchEvent, b: MatchEvent): number => abs(a) - abs(b)
    const inFile = (e: MatchEvent): boolean => (e.sourceFileIndex ?? 0) < files.length
    const goals = linked.filter((e) => (e.type === 'goal' || e.type === 'own_goal') && inFile(e)).sort(byTime)
    const others = linked.filter((e) => !isMarker(e) && e.type !== 'goal' && e.type !== 'own_goal' && inFile(e))
    const chosen = goals.length > 0 ? goals : others.sort(byTime)
    const kick = kickOffSec(linked, offsets)
    if (chosen.length > 0) {
        const isGoals = goals.length > 0
        return chosen.map((e, i) => {
            const idx = e.sourceFileIndex ?? 0
            const who = e.scorer?.trim()
            const what = isGoals ? (e.type === 'own_goal' ? 'Own goal' : 'Goal') : eventLabel(e)
            return {
                id: e.id, event: e, fileIndex: idx, timeSec: pickTime(e.matchTimeSec, files[idx]?.durationSec),
                label: `${what} ${i + 1} of ${chosen.length} · ${matchMinute(abs(e), kick)}'${who ? ` ${who}` : ''}`,
            }
        })
    }
    // Nothing tagged: the middle of the match (kick off to final whistle when both are known, else the whole timeline).
    const last = files.length - 1
    const total = (offsets[last] ?? 0) + (files[last].durationSec ?? 0)
    const end = finalWhistleSec(linked, offsets)
    const mid = end !== null && end > kick ? (kick + end) / 2 : (kick + total) / 2
    let idx = 0
    offsets.forEach((o, i) => { if (i < files.length && o <= mid) idx = i })
    return [{ id: 'middle', event: null, fileIndex: idx, timeSec: pickTime(mid - (offsets[idx] ?? 0) + THUMB_LEAD_SEC, files[idx].durationSec), label: 'Middle of the match' }]
}

/** "Matchday 3 - Whites v Colours (highlights thumbnail).jpg": the reel's name without the score (it would give it away). */
export function thumbnailFileName(a: { kind: 'highlights' | 'fullMatch'; title: string | null; teams: Team[] }): string {
    const title = a.title?.trim() ? shortTitle(a.title) : ''
    const named = a.teams.length >= 2 && a.teams.slice(0, 2).every((t) => clean(t.name))
    const versus = named ? `${clean(a.teams[0].name)} v ${clean(a.teams[1].name)}` : ''
    const base = [title, versus].filter(Boolean).join(' - ') || 'Match'
    return `${base} (${a.kind === 'fullMatch' ? 'full match' : 'highlights'} thumbnail).jpg`
}
