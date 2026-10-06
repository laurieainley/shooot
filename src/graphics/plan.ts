import type { MatchEvent, Team } from '../types'
import type { Cut } from '../render/types'
import { eventLabel, eventSummary, isScoring, shortNote } from '../utils/eventTypes'
import { linkedEvents } from '../utils/relink'
import { finalScore, formatScore, scoreAt, scoresAfter, type Score } from '../utils/score'
import type { ScoreBugWindow } from '../utils/scoreBug'
import { CAPTION_DELAY_SEC, CAPTION_SEC } from './layout'
import { ORANGE, teamBadge } from './teamStyle'
import type { BugSpec, CaptionClock, CaptionSpec, CardSpec, GraphicsSpec, OverlaySpec } from './types'

export type GraphicsSettings = {
    cards: boolean
    /** Event captions (top-left, 5 s); the key predates the move from the bottom lower third. */
    lowerThirds: boolean
    replayTag: boolean
}

/** Settings from storage or an imported project: only the current switches, the rest (e.g. the removed "score always on screen") ignored. */
export function normaliseGraphics(v: unknown, fallback: GraphicsSettings): GraphicsSettings {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const pick = (k: keyof GraphicsSettings): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : fallback[k])
    return { cards: pick('cards'), lowerThirds: pick('lowerThirds'), replayTag: pick('replayTag') }
}

/** Captions go on goals (incl. penalties and own goals), missed penalties and highlights with a note. */
export function wantsLowerThird(e: Pick<MatchEvent, 'type' | 'notes' | 'pen'>): boolean {
    if (isScoring(e) || e.type === 'penalty_missed') return true
    return e.type === 'highlight' && !!e.notes?.trim()
}

const upper = (s: string | undefined): string | undefined => (s?.trim() ? s.trim().toUpperCase() : undefined)

/** Team initials and colours for the score bug, with the given score. */
function bugFor(teams: Team[], score: Score): BugSpec {
    const a = teamBadge(teams[0])
    const b = teamBadge(teams[1])
    return { left: a.initials, right: b.initials, leftColour: a.colour, rightColour: b.colour, text: formatScore(score) }
}

function cards(teams: Team[], events: MatchEvent[], matchday: string): Pick<GraphicsSpec, 'intro' | 'outro'> {
    const intro: CardSpec = { heading: matchday.trim().toUpperCase() || 'MATCH', centre: 'VS', left: teamBadge(teams[0]), right: teamBadge(teams[1]) }
    const [a, b] = finalScore(events, teams)
    return { intro, outro: { ...intro, heading: 'FULL TIME', centre: `${a} - ${b}` } }
}

type CaptionOverlay = Extract<OverlaySpec, { kind: 'caption' }>

export function buildGraphicsSpec(args: {
    events: MatchEvent[]
    teams: Team[]
    cuts: Cut[]
    cumulativeOffsets: number[]
    settings: GraphicsSettings
    matchday: string
}): GraphicsSpec {
    const { teams, cuts, cumulativeOffsets, settings } = args
    const events = linkedEvents(args.events)
    const spec: GraphicsSpec = { overlays: [] }
    const both = teams.length >= 2
    const globalOf = (src: number, t: number): number => (cumulativeOffsets[src] ?? 0) + t

    if (settings.cards && both) Object.assign(spec, cards(teams, events, args.matchday))

    const captions: CaptionOverlay[] = []
    if (settings.lowerThirds) {
        const after = both ? scoresAfter(events, teams, cumulativeOffsets) : new Map<string, Score>()
        const parts: CaptionOverlay[][] = []
        for (const e of events) {
            if (!wantsLowerThird(e)) continue
            const src = e.sourceFileIndex ?? 0
            const t = e.matchTimeSec
            const cutIndex = cuts.findIndex((c) => c.sourceIndex === src && (c.speed ?? 1) === 1 && c.startSec <= t && t < c.endSec)
            if (cutIndex === -1) continue
            const cut = cuts[cutIndex]
            const team = teams.find((x) => x.name === e.team)
            const cs: CaptionSpec = { label: eventLabel(e).toUpperCase(), stripe: team?.color ?? ORANGE }
            const person = upper(e.scorer)
            if (person) cs.person = person
            const note = upper(shortNote(e.notes, 60))
            if (note) cs.note = note
            if (both) cs.bug = bugFor(teams, after.get(e.id) ?? scoreAt(events, teams, cumulativeOffsets, globalOf(src, t)))
            // Starts 1 s after the event; what the clip cannot hold carries on over the start of its replay.
            const start = t + CAPTION_DELAY_SEC
            const first = Math.max(0, Math.min(CAPTION_SEC, cut.endSec - start))
            const label = `Caption: ${eventSummary(e)}`
            const clock = (offsetSec: number, rate: number): CaptionClock => ({ offsetSec, rate, totalSec: CAPTION_SEC })
            const part: CaptionOverlay[] = []
            if (first > 0.05) part.push({ kind: 'caption', cutIndex, startSec: start, durationSec: first, spec: cs, clock: clock(0, 1), label })
            const next = cuts[cutIndex + 1]
            const rest = CAPTION_SEC - (first > 0.05 ? first : 0)
            if (rest > 0.05 && next && (next.speed ?? 1) < 1) {
                const speed = next.speed ?? 1
                const offset = CAPTION_SEC - rest
                part.push({ kind: 'caption', cutIndex: cutIndex + 1, startSec: next.startSec, durationSec: Math.min(next.endSec - next.startSec, rest * speed), spec: cs, clock: clock(offset, 1 / speed), fromCutStart: true, label })
            }
            if (part.length === 0) continue
            parts.push(part)
        }
        parts.sort((x, y) => x[0].cutIndex - y[0].cutIndex || x[0].startSec - y[0].startSec)
        // A caption that the next one (same clip) interrupts gets out of the way first, and does not carry on.
        for (let i = 0; i + 1 < parts.length; i++) {
            const a = parts[i][0]
            const b = parts[i + 1][0]
            if (a.cutIndex === b.cutIndex && b.startSec < a.startSec + a.durationSec) {
                a.durationSec = b.startSec - a.startSec
                a.clock = { ...a.clock, totalSec: a.durationSec }
                parts[i] = [a]
            }
        }
        captions.push(...parts.flat().filter((o) => o.durationSec > 0))
        captions.sort((x, y) => x.cutIndex - y.cutIndex || x.startSec - y.startSec)
        spec.overlays.push(...captions)
    }

    if (settings.replayTag) {
        cuts.forEach((c, cutIndex) => {
            if ((c.speed ?? 1) < 1) spec.overlays.push({ kind: 'replayTag', cutIndex, startSec: c.startSec, durationSec: c.endSec - c.startSec, label: 'Replay tag' })
        })
    }
    return spec
}

/**
 * Graphics for the full match: optional VS / full-time cards and the score bug windows (whole-timeline seconds,
 * see utils/scoreBug.ts) placed on the cuts. A window across a file join is split there without a fade.
 */
export function fullMatchGraphicsSpec(args: {
    events: MatchEvent[]
    teams: Team[]
    cuts: Cut[]
    cumulativeOffsets: number[]
    cards: boolean
    matchday: string
    windows: ScoreBugWindow[]
}): GraphicsSpec {
    const { teams, cuts, cumulativeOffsets } = args
    const events = linkedEvents(args.events)
    const spec: GraphicsSpec = { overlays: [] }
    if (teams.length < 2) return spec
    if (args.cards) Object.assign(spec, cards(teams, events, args.matchday))
    for (const w of args.windows) {
        const a = w.startSec
        const b = w.startSec + w.durationSec
        cuts.forEach((c, cutIndex) => {
            const off = cumulativeOffsets[c.sourceIndex] ?? 0
            const s0 = Math.max(a, off + c.startSec)
            const s1 = Math.min(b, off + c.endSec)
            if (s1 - s0 < 0.05) return
            spec.overlays.push({
                kind: 'scoreBug', cutIndex, startSec: s0 - off, durationSec: s1 - s0,
                scores: [{ fromSec: s0 - off, bug: bugFor(teams, w.score) }],
                fadeIn: s0 - a < 0.05, fadeOut: b - s1 < 0.05, label: 'Score bug',
            })
        })
    }
    spec.overlays.sort((x, y) => x.cutIndex - y.cutIndex || x.startSec - y.startSec)
    return spec
}
