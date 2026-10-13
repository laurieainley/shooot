import type { KeepType, Suggestion, SuggestionRun, SuggestionStatus } from '../types'
import type { ScoredMoment } from './goalAudioScore'

/** A kept suggestion whose event no longer exists (undone or deleted) is pending again; a rejected one whose event is back is kept. */
export function effectiveStatus(s: Suggestion, eventIds: ReadonlySet<string>): SuggestionStatus {
    const live = !!s.eventId && eventIds.has(s.eventId)
    if (s.status === 'kept') return live ? 'kept' : 'pending'
    // Rejected after a keep, then the event came back (undo): it counts as kept again.
    if (s.status === 'rejected' && live) return 'kept'
    return s.status
}

/** "Find goals again": decisions stay, pending suggestions are replaced, new moments next to a decided one are skipped. */
export function mergeSuggestions(prev: Suggestion[], next: ScoredMoment[], minGapSec: number, makeId: () => string): Suggestion[] {
    const decided = prev.filter((x) => x.status !== 'pending')
    const fresh = next
        .filter((m) => decided.every((d) => Math.abs(d.globalTimeSec - m.timeSec) >= minGapSec / 2))
        .map((m): Suggestion => ({ id: makeId(), globalTimeSec: m.timeSec, score: m.score, source: 'audio', status: 'pending' }))
    return [...decided, ...fresh].sort((a, b) => a.globalTimeSec - b.globalTimeSec)
}

export type ReviewCounts = { total: number; kept: number; rejected: number; pending: number; byType: Partial<Record<KeepType, number>> }

export function reviewCounts(suggestions: Suggestion[], eventIds: ReadonlySet<string>): ReviewCounts {
    const c: ReviewCounts = { total: suggestions.length, kept: 0, rejected: 0, pending: 0, byType: {} }
    for (const s of suggestions) {
        const st = effectiveStatus(s, eventIds)
        if (st === 'kept') {
            c.kept++
            if (s.keptAs) c.byType[s.keptAs] = (c.byType[s.keptAs] ?? 0) + 1
        } else if (st === 'rejected') c.rejected++
        else c.pending++
    }
    return c
}

/** Pending suggestions as positions on the match strip. */
export function suggestionMarks(suggestions: Suggestion[], eventIds: ReadonlySet<string>, totalSec: number): { id: string; leftPct: number; timeSec: number; top: boolean }[] {
    if (!(totalSec > 0)) return []
    return suggestions.filter((s) => effectiveStatus(s, eventIds) === 'pending')
        .map((s) => ({ id: s.id, leftPct: Math.min(100, Math.max(0, (s.globalTimeSec / totalSec) * 100)), timeSec: s.globalTimeSec, top: !!s.ball }))
}

/** False when the videos changed since the run (a run saved before file keys were recorded counts as current). */
export function runMatchesFiles(run: SuggestionRun | null, currentKeys: readonly string[]): boolean {
    if (!run?.fileKeys) return true
    return run.fileKeys.length === currentKeys.length && run.fileKeys.every((k, i) => k === currentKeys[i])
}

/** Where the review should start: the first pending suggestion, or the end (summary) when none is pending. */
export function firstPendingIndex(suggestions: Suggestion[], eventIds: ReadonlySet<string>): number {
    const i = suggestions.findIndex((s) => effectiveStatus(s, eventIds) === 'pending')
    return i < 0 ? suggestions.length : i
}

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

/** Plain text for Copy diagnostics: settings and counts only (no times, no audio). */
export type BallReport = { ep: string | null; ms: number | null; tagged: number } | { error: string }

export function detectionReport(run: SuggestionRun | null, counts: ReviewCounts, ball?: BallReport | null): string {
    const types = Object.entries(counts.byType).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')
    return [
        `Find goals, ${run?.source ?? 'audio'}, config v${run?.configVersion ?? '?'}`,
        `Analysed: ${run ? mmss(run.analysedSec) : '—'}`,
        `Range: ${run?.bounded === undefined ? '—' : run.bounded ? 'kick off → final whistle' : 'whole video'}`,
        `Run time: ${run?.durationMs !== undefined ? `${Math.round(run.durationMs / 1000)}s` : '—'}`,
        `Kept ${counts.kept} of ${counts.total}${types ? ` (${types})` : ''}, rejected ${counts.rejected}, not reviewed ${counts.pending}`,
        ...(ball ? [`Ball check: ${'error' in ball ? ball.error : `${ball.ep ?? '?'}, ${ball.ms !== null ? Math.round(ball.ms / 1000) : '—'} s, ${ball.tagged} tagged`}`] : []),
    ].join('\n')
}
