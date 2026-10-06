// The two exports as plain plans: what to cut from which files, the graphics, the output name and a signature.
import type { MatchEvent, Team, VideoSourceFile } from '../types'
import type { Cut, RenderSource } from '../render/types'
import { buildGraphicsSpec, fullMatchGraphicsSpec, type GraphicsSettings } from '../graphics/plan'
import type { GraphicsSpec } from '../graphics/types'
import { CARD_SEC } from '../graphics/layout'
import { estimateBytes, fullMatchCuts, fullMatchSpan, recordingGaps } from './fullMatch'
import { mergeOverlappingGoalSegments } from './highlights'
import { jobSignature } from './jobSignature'
import { kickOffSec } from './matchClock'
import { linkedEvents } from './relink'
import { buildRenderPlan } from './renderPlan'
import { resolveRenderSources, type RenderQuality } from './renderSources'
import { scoreBugWindows, type ScoreBugMode } from './scoreBug'

export type FullMatchSettings = { cards: boolean; scoreBug: ScoreBugMode; intervalMin: number }

export type ExportState = {
    files: VideoSourceFile[]
    events: MatchEvent[]
    cumulativeOffsets: number[]
    adjustTimestampsByOffset: boolean
    lengthBeforeGoalSec: number
    lengthAfterGoalSec: number
    replayBeforeSec: number
    replayAfterSec: number
    replaySpeed: number
    graphics: GraphicsSettings
    teams: Team[]
    matchdayLabel: string | null
    fullMatch: FullMatchSettings
}

export type ExportPlan = {
    cuts: Cut[]
    sources: RenderSource[]
    /** Proxy timelines: files whose full-quality version is not attached. */
    missing: string[]
    /** Graphics to draw (undefined = none). */
    spec: GraphicsSpec | undefined
    outputName: string
    /** Output length (cards included) and estimated size. */
    seconds: number
    bytes: number
    /** Long renders save progress so they can resume after a reload. */
    resumable: boolean
    /** Every frame is re-encoded (score always on screen). */
    reencodeAll: boolean
    signature: string
}

const matchday = (s: ExportState): string => s.matchdayLabel?.trim() || 'MATCH'
const nonEmpty = (spec: GraphicsSpec): GraphicsSpec | undefined => (spec.intro || spec.outro || spec.overlays.length > 0 ? spec : undefined)
const cardsSec = (spec: GraphicsSpec | undefined): number => (spec?.intro ? CARD_SEC : 0) + (spec?.outro ? CARD_SEC : 0)

function finish(kind: 'highlights' | 'fullMatch', quality: RenderQuality, s: ExportState, cuts: Cut[], spec: GraphicsSpec | undefined, base: string, resumable: boolean, reencodeAll: boolean): ExportPlan {
    const { sources, missing } = resolveRenderSources(s.files, quality)
    const durations = s.files.map((f) => f.durationSec ?? 0)
    const seconds = cuts.reduce((sum, c) => sum + (c.endSec - c.startSec) / (c.speed ?? 1), 0) + cardsSec(spec)
    const bytes = estimateBytes(cuts.map((c) => ({ ...c })), sources.map((x) => x.file.size), durations)
    const outputName = `${base}${quality === 'preview' ? '-preview' : ''}.mp4`
    const signature = jobSignature({ kind, quality, cuts, sources: sources.map((x) => [x.name, x.file.size]), spec: spec ?? null })
    return { cuts, sources, missing, spec, outputName, seconds, bytes, resumable, reencodeAll, signature }
}

export function highlightsExport(s: ExportState, quality: RenderQuality): ExportPlan {
    const linked = linkedEvents(s.events)
    const segments = mergeOverlappingGoalSegments(linked, s.cumulativeOffsets, kickOffSec(linked, s.cumulativeOffsets), s.adjustTimestampsByOffset, s.lengthBeforeGoalSec, s.lengthAfterGoalSec)
    const cuts = buildRenderPlan(segments, s.files.map((f) => f.durationSec ?? Infinity), { beforeSec: s.replayBeforeSec, afterSec: s.replayAfterSec, speed: s.replaySpeed })
    const spec = nonEmpty(buildGraphicsSpec({ events: linked, teams: s.teams, cuts, cumulativeOffsets: s.cumulativeOffsets, settings: s.graphics, matchday: matchday(s) }))
    const reencodeAll = !!spec?.overlays.some((o) => o.kind === 'scoreBug')
    return finish('highlights', quality, s, cuts, spec, 'highlights', reencodeAll, reencodeAll)
}

export function fullMatchExport(s: ExportState, quality: RenderQuality): ExportPlan {
    const linked = linkedEvents(s.events)
    const durations = s.files.map((f) => f.durationSec ?? 0)
    const span = fullMatchSpan(linked, s.cumulativeOffsets, durations)
    const cuts = fullMatchCuts(durations, span.startSec, span.endSec)
    const windows = scoreBugWindows({
        events: linked, teams: s.teams, cumulativeOffsets: s.cumulativeOffsets, kickOffSec: span.startSec, finalWhistleSec: span.endSec,
        mode: s.fullMatch.scoreBug, intervalMin: s.fullMatch.intervalMin, gapsSec: recordingGaps(s.files, s.cumulativeOffsets),
    })
    const spec = nonEmpty(fullMatchGraphicsSpec({ events: linked, teams: s.teams, cuts, cumulativeOffsets: s.cumulativeOffsets, cards: s.fullMatch.cards, matchday: matchday(s), windows }))
    return finish('fullMatch', quality, s, cuts, spec, 'full-match', true, false)
}
