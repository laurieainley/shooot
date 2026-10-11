import type { KeepType, Suggestion, SuggestionRun, SuggestionStatus } from '../types'
import type { ScoredMoment } from './goalAudioScore'

/** A kept suggestion whose event no longer exists (undone or deleted) is pending again. */
export function effectiveStatus(s: Suggestion, eventIds: ReadonlySet<string>): SuggestionStatus {
    return s.status === 'kept' && (!s.eventId || !eventIds.has(s.eventId)) ? 'pending' : s.status
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
export function suggestionMarks(suggestions: Suggestion[], eventIds: ReadonlySet<string>, totalSec: number): { id: string; leftPct: number; timeSec: number }[] {
    if (!(totalSec > 0)) return []
    return suggestions.filter((s) => effectiveStatus(s, eventIds) === 'pending')
        .map((s) => ({ id: s.id, leftPct: Math.min(100, Math.max(0, (s.globalTimeSec / totalSec) * 100)), timeSec: s.globalTimeSec }))
}

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

/** Plain text for Copy diagnostics: settings and counts only (no times, no audio). */
export function detectionReport(run: SuggestionRun | null, counts: ReviewCounts): string {
    const types = Object.entries(counts.byType).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')
    return [
        `Find goals (Beta), ${run?.source ?? 'audio'}, config v${run?.configVersion ?? '?'}`,
        `Analysed: ${run ? mmss(run.analysedSec) : '—'}`,
        `Kept ${counts.kept} of ${counts.total}${types ? ` (${types})` : ''}, rejected ${counts.rejected}, not reviewed ${counts.pending}`,
    ].join('\n')
}
