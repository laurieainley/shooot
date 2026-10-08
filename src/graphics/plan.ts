import type { MatchEvent, Team } from '../types'
import type { Cut } from '../render/types'
import { assistOf, eventSummary, isScoring, shortNote } from '../utils/eventTypes'
import { markerGlobalSec, matchMinute } from '../utils/matchClock'
import { linkedEvents } from '../utils/relink'
import { finalScore, formatScore, scoreAt, scoresAfter, type Score } from '../utils/score'
import { subtractIntervals, type ScoreBugWindow } from '../utils/scoreBug'
import { CAPTION_DELAY_SEC, CAPTION_SEC } from './layout'
import { C } from './brandColors'
import { teamBadge } from './teamStyle'
import type { BugSpec, CaptionClock, CaptionSpec, CaptionTone, CardSpec, GraphicsSpec, OverlaySpec, ScorerLine } from './types'

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

/** Captions go on goals (incl. penalties and own goals), missed penalties and highlights (with or without a note). */
export function wantsLowerThird(e: Pick<MatchEvent, 'type' | 'notes' | 'pen'>): boolean {
    return isScoring(e) || e.type === 'penalty_missed' || e.type === 'highlight'
}

const upper = (s: string | undefined): string | undefined => (s?.trim() ? s.trim().toUpperCase() : undefined)

/** Team initials and colours for the score bug, with the given score. */
function bugFor(teams: Team[], score: Score): BugSpec {
    const a = teamBadge(teams[0])
    const b = teamBadge(teams[1])
    return { left: a.initials, right: b.initials, leftColour: a.colour, rightColour: b.colour, text: formatScore(score) }
}

const absTime = (e: MatchEvent, offsets: number[]): number => e.globalTimeSec ?? (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec

/** The event word of a caption, in the stadium voice. */
export function captionWord(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    switch (e.type) {
        case 'goal': return e.pen ? 'PEN GOAL' : 'GOAL!'
        case 'own_goal': return 'OWN GOAL'
        case 'penalty_missed': return 'PENALTY MISSED'
        case 'penalty_conceded': return 'PENALTY CONCEDED'
        case 'save': return 'SAVE'
        case 'foul': return 'FOUL'
        case 'highlight': return 'HIGHLIGHT'
        default: return e.type.replace(/_/g, ' ').toUpperCase()
    }
}

const captionTone = (e: Pick<MatchEvent, 'type'>): CaptionTone => (e.type === 'goal' ? 'goal' : e.type === 'own_goal' ? 'ownGoal' : 'other')

/** `'34`: the match minute, only when kick-off is marked (minutes from the start of a file would mislead). */
function minuteOf(e: MatchEvent, events: MatchEvent[], offsets: number[]): string | undefined {
    const kickOff = markerGlobalSec(events, offsets, 'kick_off')
    return kickOff === null ? undefined : `'${matchMinute(absTime(e, offsets), kickOff)}`
}

/**
 * Who scored for each team, for the full-time card: chronological by first goal, minutes after the name (`'13 '44 PEN`),
 * own goals under the team that was credited (`SMITH (OG)`). Goals without a name only count in the score.
 */
export function scorerColumns(events: MatchEvent[], teams: Team[], offsets: number[]): { left: ScorerLine[]; right: ScorerLine[] } {
    const kickOff = markerGlobalSec(events, offsets, 'kick_off') ?? 0
    const cols: { left: Map<string, ScorerLine>; right: Map<string, ScorerLine> } = { left: new Map(), right: new Map() }
    const scoring = events.filter((e) => isScoring(e) && !e.unlinked).sort((a, b) => absTime(a, offsets) - absTime(b, offsets))
    for (const e of scoring) {
        const side = e.team === teams[0].name ? cols.left : e.team === teams[1].name ? cols.right : null
        const who = e.scorer?.trim().toUpperCase()
        if (!side || !who) continue
        const name = e.type === 'own_goal' ? `${who} (OG)` : who
        const mark = `'${matchMinute(absTime(e, offsets), kickOff)}${e.pen ? ' PEN' : ''}`
        const line = side.get(name)
        if (line) line.minutes += ` ${mark}`
        else side.set(name, { name, minutes: mark })
    }
    return { left: [...cols.left.values()], right: [...cols.right.values()] }
}

function cards(teams: Team[], events: MatchEvent[], matchday: string, offsets: number[]): Pick<GraphicsSpec, 'intro' | 'outro'> {
    const intro: CardSpec = { heading: matchday.trim().toUpperCase() || 'MATCH', centre: 'VS', left: teamBadge(teams[0]), right: teamBadge(teams[1]) }
    const [a, b] = finalScore(events, teams)
    const scorers = scorerColumns(events, teams, offsets)
    const hasScorers = scorers.left.length + scorers.right.length > 0
    return { intro, outro: { ...intro, heading: 'FULL TIME', centre: `${a} - ${b}`, ...(hasScorers ? { scorers } : {}) } }
}

/** Caption content for one event (shared by highlights and the full match): word, person, assist, note, minute and the score bug (given score). */
function eventCaptionSpec(e: MatchEvent, teams: Team[], score: Score | undefined, events: MatchEvent[], offsets: number[]): CaptionSpec {
    const team = teams.find((x) => x.name === e.team)
    const cs: CaptionSpec = { label: captionWord(e), tone: captionTone(e), stripe: team?.color ?? C.muted }
    const person = upper(e.scorer)
    if (person) cs.person = person
    const assist = upper(assistOf(e))
    if (assist) cs.assist = assist
    const note = upper(shortNote(e.notes, 60))
    if (note) cs.note = note
    const minute = minuteOf(e, events, offsets)
    if (minute) cs.minute = minute
    if (score) cs.bug = bugFor(teams, score)
    return cs
}

/** The full match captions goals (incl. penalties, own goals), conceded and missed penalties; not highlights, saves or fouls. */
export function wantsFullMatchCaption(e: Pick<MatchEvent, 'type' | 'notes' | 'pen'>): boolean {
    return isScoring(e) || e.type === 'penalty_missed' || e.type === 'penalty_conceded'
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

    if (settings.cards && both) Object.assign(spec, cards(teams, events, args.matchday, cumulativeOffsets))

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
            const cs = eventCaptionSpec(e, teams, both ? (after.get(e.id) ?? scoreAt(events, teams, cumulativeOffsets, globalOf(src, t))) : undefined, events, cumulativeOffsets)
            // Goals etc.: 1 s after the event; what the clip cannot hold carries on over the start of its replay.
            // Highlights: from the start of their clip (the moment itself is the whole point of the clip).
            const atClipStart = e.type === 'highlight'
            const start = atClipStart ? cut.startSec : t + CAPTION_DELAY_SEC
            const first = Math.max(0, Math.min(CAPTION_SEC, cut.endSec - start))
            const label = `Caption: ${eventSummary(e)}`
            const clock = (offsetSec: number, rate: number): CaptionClock => ({ offsetSec, rate, totalSec: CAPTION_SEC })
            const part: CaptionOverlay[] = []
            const next = cuts[cutIndex + 1]
            const rest = CAPTION_SEC - (first > 0.05 ? first : 0)
            const carriesOn = rest > 0.05 && !!next && (next.speed ?? 1) < 1
            // A caption that carries on into the replay stays up to the clip's real end (whole GOPs), so the join has no gap.
            if (first > 0.05) part.push({ kind: 'caption', cutIndex, startSec: start, durationSec: first, spec: cs, clock: clock(0, 1), label, ...(atClipStart ? { fromCutStart: true } : {}), ...(carriesOn && !atClipStart ? { toCutEnd: true } : {}) })
            if (carriesOn && next) {
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
            if ((c.speed ?? 1) < 1) spec.overlays.push({ kind: 'replayTag', cutIndex, startSec: c.startSec, durationSec: c.endSec - c.startSec, speed: c.speed ?? 1, label: 'Replay tag' })
        })
    }
    return spec
}

export type FullMatchCaptionWindow = { event: MatchEvent; eventSec: number; startSec: number; durationSec: number }

/**
 * When the full match shows each event caption, on the whole timeline: from CAPTION_DELAY_SEC after the moment for
 * CAPTION_SEC, cut short where the next caption begins.
 */
export function fullMatchCaptionWindows(events: MatchEvent[], cumulativeOffsets: number[]): FullMatchCaptionWindow[] {
    const list = events
        .filter(wantsFullMatchCaption)
        .map((event) => {
            const eventSec = (cumulativeOffsets[event.sourceFileIndex ?? 0] ?? 0) + event.matchTimeSec
            return { event, eventSec, startSec: eventSec + CAPTION_DELAY_SEC, durationSec: CAPTION_SEC }
        })
        .sort((x, y) => x.startSec - y.startSec)
    for (let i = 0; i + 1 < list.length; i++) list[i].durationSec = Math.min(list[i].durationSec, list[i + 1].startSec - list[i].startSec)
    return list.filter((c) => c.durationSec > 0)
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
    /** Event captions (same content and timing as the highlights); they replace the score bug where they overlap it. */
    captions?: boolean
}): GraphicsSpec {
    const { teams, cuts, cumulativeOffsets } = args
    const events = linkedEvents(args.events)
    const spec: GraphicsSpec = { overlays: [] }
    if (teams.length < 2) return spec
    if (args.cards) Object.assign(spec, cards(teams, events, args.matchday, cumulativeOffsets))
    const after = scoresAfter(events, teams, cumulativeOffsets)
    const captionTimes = args.captions ? fullMatchCaptionWindows(events, cumulativeOffsets) : []
    for (const c of captionTimes) {
        const e = c.event
        const cs = eventCaptionSpec(e, teams, after.get(e.id) ?? scoreAt(events, teams, cumulativeOffsets, c.eventSec), events, cumulativeOffsets)
        const a = c.startSec
        const b = a + c.durationSec
        const label = `Caption: ${eventSummary(e)}`
        cuts.forEach((cut, cutIndex) => {
            const off = cumulativeOffsets[cut.sourceIndex] ?? 0
            const s0 = Math.max(a, off + cut.startSec)
            const s1 = Math.min(b, off + cut.endSec)
            if (s1 - s0 < 0.05) return
            spec.overlays.push({
                kind: 'caption', cutIndex, startSec: s0 - off, durationSec: s1 - s0, spec: cs, label,
                clock: { offsetSec: s0 - a, rate: 1, totalSec: b - a },
                ...(s0 - a > 0.05 ? { fromCutStart: true } : {}), ...(b - s1 > 0.05 ? { toCutEnd: true } : {}),
            })
        })
    }
    for (const w of subtractIntervals(args.windows, captionTimes)) {
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
