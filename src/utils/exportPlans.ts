// The two exports as plain plans: what to cut from which files, the graphics, the output name and a signature.
import type { GoalAreas, MatchEvent, Team, VideoSourceFile } from '../types'
import { replayOptionsFor } from './attack'
import type { Cut, RenderSource } from '../render/types'
import { buildGraphicsSpec, fullMatchGraphicsSpec, type GraphicsSettings } from '../graphics/plan'
import { isSting, type GraphicsSpec } from '../graphics/types'
import { CARD_SEC, STING_SEC } from '../graphics/layout'
import { estimateBytes, fullMatchCuts, fullMatchSpan, recordingGaps, withReplays } from './fullMatch'
import { mergeOverlappingGoalSegments } from './highlights'
import { eventLabel, isMarker } from './eventTypes'
import { markerGlobalSec, matchMinute } from './matchClock'
import { wantsReplay } from './replays'
import { jobSignature } from './jobSignature'
import { outputFileName } from './outputName'
import { linkedEvents } from './relink'
import { buildRenderPlan } from './renderPlan'
import { resolveRenderSources, usedMissing, type RenderQuality } from './renderSources'
import { scoreBugWindows, type ScoreBugMode } from './scoreBug'

export type FullMatchSettings = { cards: boolean; scoreBug: ScoreBugMode; intervalMin: number; captions: boolean; /** Slow-mo replays after each event that has one, as in the highlights. */ replays: boolean }

export type ExportState = {
    files: VideoSourceFile[]
    events: MatchEvent[]
    cumulativeOffsets: number[]
    lengthBeforeGoalSec: number
    lengthAfterGoalSec: number
    replayBeforeSec: number
    replayAfterSec: number
    replaySpeed: number
    graphics: GraphicsSettings
    teams: Team[]
    matchdayLabel: string | null
    fullMatch: FullMatchSettings
    /** Replay zoom: where the goals are in the picture and which way the first team attacks in the first half. */
    goalAreas?: GoalAreas | null
}

export type ExportPlan = {
    cuts: Cut[]
    sources: RenderSource[]
    /** Proxy timelines: files whose full-quality version is not attached. */
    missing: string[]
    /** Graphics to draw (undefined = none). */
    spec: GraphicsSpec | undefined
    /** "Matchday 3 - Whites 2-4 Colours.mp4" (see outputFileName). */
    outputName: string
    kind: 'highlights' | 'fullMatch' | 'clip'
    /** Output length (cards included) and estimated size. */
    seconds: number
    bytes: number
    /** Long renders save progress so they can resume after a reload. */
    resumable: boolean
    signature: string
}

const matchday = (s: ExportState): string => s.matchdayLabel?.trim() || 'MATCH'
const nonEmpty = (spec: GraphicsSpec): GraphicsSpec | undefined => (spec.intro || spec.outro || spec.overlays.length > 0 ? spec : undefined)
const cardsSec = (spec: GraphicsSpec | undefined): number => (spec?.intro ? CARD_SEC : 0) + (spec?.outro ? (isSting(spec.outro) ? STING_SEC : CARD_SEC) : 0)

function finish(kind: 'highlights' | 'fullMatch' | 'clip', quality: RenderQuality, s: ExportState, cuts: Cut[], spec: GraphicsSpec | undefined, resumable: boolean, clip?: { minute: number | null; label: string; person?: string }): ExportPlan {
    const { sources, missing } = resolveRenderSources(s.files, quality)
    const durations = s.files.map((f) => f.durationSec ?? 0)
    const seconds = cuts.reduce((sum, c) => sum + (c.endSec - c.startSec) / (c.speed ?? 1), 0) + cardsSec(spec)
    const bytes = estimateBytes(cuts.map((c) => ({ ...c })), sources.map((x) => x.file.size), durations)
    const outputName = outputFileName({ kind, preview: quality === 'preview', title: s.matchdayLabel, teams: s.teams, events: linkedEvents(s.events), clip })
    const signature = jobSignature({ kind, quality, cuts, sources: sources.map((x) => [x.name, x.file.size]), spec: spec ?? null })
    return { cuts, sources, missing, spec, outputName, kind, seconds, bytes, resumable, signature }
}

export function highlightsExport(s: ExportState, quality: RenderQuality): ExportPlan {
    const linked = linkedEvents(s.events)
    const segments = mergeOverlappingGoalSegments(linked, s.cumulativeOffsets, s.lengthBeforeGoalSec, s.lengthAfterGoalSec)
    const cuts = buildRenderPlan(segments, s.files.map((f) => f.durationSec ?? Infinity), replayOptionsFor({ ...s, events: linked }))
    const spec = nonEmpty(buildGraphicsSpec({ events: linked, teams: s.teams, cuts, cumulativeOffsets: s.cumulativeOffsets, settings: s.graphics, matchday: matchday(s) }))
    return finish('highlights', quality, s, cuts, spec, false)
}

export function fullMatchExport(s: ExportState, quality: RenderQuality): ExportPlan {
    const linked = linkedEvents(s.events)
    const durations = s.files.map((f) => f.durationSec ?? 0)
    const span = fullMatchSpan(linked, s.cumulativeOffsets, durations)
    const matchCuts = fullMatchCuts(durations, span.startSec, span.endSec)
    const cuts = s.fullMatch.replays ? withReplays(matchCuts, linked, s.cumulativeOffsets, replayOptionsFor({ ...s, events: linked })) : matchCuts
    const windows = scoreBugWindows({
        events: linked, teams: s.teams, cumulativeOffsets: s.cumulativeOffsets, kickOffSec: span.startSec, finalWhistleSec: span.endSec,
        mode: s.fullMatch.scoreBug, intervalMin: s.fullMatch.intervalMin, gapsSec: recordingGaps(s.files, s.cumulativeOffsets),
    })
    const spec = nonEmpty(fullMatchGraphicsSpec({ events: linked, teams: s.teams, cuts, cumulativeOffsets: s.cumulativeOffsets, cards: s.fullMatch.cards, captions: s.fullMatch.captions, theme: s.graphics.theme, matchday: matchday(s), windows, replayTag: s.graphics.replayTag }))
    return finish('fullMatch', quality, s, cuts, spec, true)
}

export type ClipOptions = { replay: boolean; score: boolean }

/** One event as its own clip: its padding, an optional slow-mo replay, a caption for that event only, and the Shooot sting. */
export function clipExport(s: ExportState, eventId: string, opts: ClipOptions, quality: RenderQuality): ExportPlan | null {
    const linked = linkedEvents(s.events)
    const event = linked.find((e) => e.id === eventId)
    if (!event || isMarker(event)) return null
    const segments = mergeOverlappingGoalSegments([event], s.cumulativeOffsets, s.lengthBeforeGoalSec, s.lengthAfterGoalSec)
    const replay = opts.replay && wantsReplay(event) ? replayOptionsFor({ ...s, events: linked }) : undefined
    const cuts = buildRenderPlan(segments, s.files.map((f) => f.durationSec ?? Infinity), replay)
    const planned = buildGraphicsSpec({
        events: linked, teams: s.teams, cuts, cumulativeOffsets: s.cumulativeOffsets, settings: s.graphics, matchday: matchday(s),
        captionEvents: new Set([event.id]), captionScore: opts.score, cards: false,
    })
    const spec: GraphicsSpec = { ...planned, outro: { kind: 'sting' } }
    const kickOff = markerGlobalSec(linked, s.cumulativeOffsets, 'kick_off')
    const abs = (s.cumulativeOffsets[event.sourceFileIndex ?? 0] ?? 0) + event.matchTimeSec
    const person = event.scorer?.trim()
    const plan = finish('clip', quality, s, cuts, spec, false, {
        minute: kickOff === null ? null : matchMinute(abs, kickOff), label: eventLabel(event), ...(person ? { person } : {}),
    })
    // Only the files this clip reads matter for the full/preview choice.
    return { ...plan, missing: usedMissing(cuts, s.files, plan.missing) }
}
