import type { MatchEvent, Team } from '../types'
import type { Cut } from '../render/types'
import { eventLabel, eventSummary, isScoring, shortNote } from '../utils/eventTypes'
import { linkedEvents } from '../utils/relink'
import { finalScore, formatScore, scoresAfter } from '../utils/score'
import { LOWER_THIRD_SEC } from './layout'
import { ORANGE, teamBadge } from './teamStyle'
import type { CardSpec, GraphicsSpec, LowerThirdSpec, OverlaySpec } from './types'

export type GraphicsSettings = {
    cards: boolean
    /** Event captions (top-left, 5 s); the key predates the move from the bottom lower third. */
    lowerThirds: boolean
    replayTag: boolean
    /** Highlights: score bug on every frame (re-encodes the whole reel). */
    scoreBug: boolean
}

/** Lower thirds go on goals (incl. penalties and own goals), missed penalties and highlights with a note. */
export function wantsLowerThird(e: Pick<MatchEvent, 'type' | 'notes' | 'pen'>): boolean {
    if (isScoring(e) || e.type === 'penalty_missed') return true
    return e.type === 'highlight' && !!e.notes?.trim()
}

const upper = (s: string | undefined): string | undefined => (s?.trim() ? s.trim().toUpperCase() : undefined)

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

    if (settings.cards && both) {
        const left = teamBadge(teams[0])
        const right = teamBadge(teams[1])
        const intro: CardSpec = { heading: args.matchday.trim().toUpperCase() || 'MATCH', centre: 'VS', left, right }
        const [a, b] = finalScore(events, teams)
        spec.intro = intro
        spec.outro = { ...intro, heading: 'FULL TIME', centre: `${a} - ${b}` }
    }

    if (settings.lowerThirds) {
        const scores = both ? scoresAfter(events, teams, cumulativeOffsets) : new Map()
        const thirds: Extract<OverlaySpec, { kind: 'lowerThird' }>[] = []
        for (const e of events) {
            if (!wantsLowerThird(e)) continue
            const src = e.sourceFileIndex ?? 0
            const t = e.matchTimeSec
            const cutIndex = cuts.findIndex((c) => c.sourceIndex === src && (c.speed ?? 1) === 1 && c.startSec <= t && t < c.endSec)
            if (cutIndex === -1) continue
            const cut = cuts[cutIndex]
            const durationSec = Math.min(LOWER_THIRD_SEC, cut.endSec - cut.startSec)
            const startSec = Math.max(cut.startSec, Math.min(t, cut.endSec - durationSec))
            const team = teams.find((x) => x.name === e.team)
            const lt: LowerThirdSpec = { label: eventLabel(e).toUpperCase(), stripe: team?.color ?? ORANGE }
            const person = upper(e.scorer)
            if (person) lt.person = person
            const note = upper(shortNote(e.notes, 60))
            if (note) lt.note = note
            const score = scores.get(e.id)
            if (score) lt.score = { left: teamBadge(teams[0]).initials, right: teamBadge(teams[1]).initials, text: formatScore(score) }
            thirds.push({ kind: 'lowerThird', cutIndex, startSec, durationSec, spec: lt, label: `Lower third: ${eventSummary(e)}` })
        }
        thirds.sort((x, y) => x.cutIndex - y.cutIndex || x.startSec - y.startSec)
        // A lower third that the next one (same clip) interrupts gets out of the way first.
        for (let i = 0; i + 1 < thirds.length; i++) {
            const a = thirds[i]
            const b = thirds[i + 1]
            if (a.cutIndex === b.cutIndex && b.startSec < a.startSec + a.durationSec) a.durationSec = b.startSec - a.startSec
        }
        spec.overlays.push(...thirds.filter((o) => o.durationSec > 0))
    }

    if (settings.replayTag) {
        cuts.forEach((c, cutIndex) => {
            if ((c.speed ?? 1) < 1) spec.overlays.push({ kind: 'replayTag', cutIndex, startSec: c.startSec, durationSec: c.endSec - c.startSec, label: 'Replay tag' })
        })
    }
    return spec
}
