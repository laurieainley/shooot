import { migrateReplayCrop } from './crop'
import type { EventMark, TeaserEdit, EventType, MarkerType, MatchEvent, Team } from '../types'

export type EventMeta = {
    label: string
    icon: string
    /** Legacy tint, now a brand token: lime for goals, chalk for flags, muted otherwise. */
    color: string
    scoring: boolean
    /** Kick off / Half time / Final whistle: one each, no details, never in the highlights. */
    marker?: boolean
}

export const EVENT_META: Record<EventType, EventMeta> = {
    goal:            { label: 'Goal',            icon: '⚽', color: 'var(--sh-lime)', scoring: true },
    own_goal:        { label: 'Own goal',        icon: '⚽', color: 'var(--sh-text)', scoring: true },
    penalty_conceded: { label: 'Penalty conceded', icon: 'Ⓟ', color: 'var(--sh-muted)', scoring: false },
    penalty_missed:  { label: 'Penalty missed',  icon: 'Ⓟ', color: 'var(--sh-muted)', scoring: false },
    highlight:       { label: 'Highlight',       icon: '★', color: 'var(--sh-muted)', scoring: false },
    foul:            { label: 'Foul',            icon: '🟨', color: 'var(--sh-muted)', scoring: false },
    save:            { label: 'Save',            icon: '🧤', color: 'var(--sh-muted)', scoring: false },
    kick_off:        { label: 'Kick off',        icon: '⚑', color: 'var(--sh-text)', scoring: false, marker: true },
    half_time:       { label: 'Half time',       icon: '⏸', color: 'var(--sh-muted)', scoring: false, marker: true },
    final_whistle:   { label: 'Final whistle',   icon: '🏁', color: 'var(--sh-text)', scoring: false, marker: true },
}

export type PickerOptionId = 'goal' | 'goal_pen' | 'own_goal' | 'penalty_conceded' | 'penalty_missed' | 'highlight' | 'foul' | 'save' | MarkerType

export type PickerOption = {
    id: PickerOptionId
    type: EventType
    pen: boolean
    key: string          // lower-case shortcut in the picker
    label: string
    askTeam: boolean
    teamOptional: boolean       // team step shows Skip
    askScorer: boolean          // person step (stored in `scorer`)
    askAssist?: boolean         // optional assist step after the scorer (normal goals only; stored in `assist`)
    personLabel?: string
    personOptional: boolean     // person step shows Skip
    askText: 'prompt' | 'optional' | false // free-text step (stored in `notes`)
    textLabel?: string
    marker?: boolean            // single-instance match marker (no further steps)
}

type Base = Pick<PickerOption, 'pen' | 'askTeam' | 'teamOptional' | 'askScorer' | 'personOptional' | 'askText'>
const SCORER: Base = { pen: false, askTeam: true, teamOptional: false, askScorer: true, personOptional: false, askText: 'optional' }
const MARKER: Base = { pen: false, askTeam: false, teamOptional: false, askScorer: false, personOptional: false, askText: false }
const OPTIONAL_ALL: Base = { pen: false, askTeam: true, teamOptional: true, askScorer: true, personOptional: true, askText: 'optional' }

export const PICKER_OPTIONS: PickerOption[] = [
    { ...SCORER, id: 'goal',            type: 'goal',            key: 'g', label: 'Goal',            personLabel: 'Scorer', askAssist: true },
    { ...SCORER, id: 'goal_pen',        type: 'goal',            key: 'p', label: 'Penalty goal',     personLabel: 'Penalty taker', pen: true },
    { ...SCORER, id: 'own_goal',        type: 'own_goal',        key: 'o', label: 'Own goal',        personLabel: 'Own goal by' },
    { ...SCORER, id: 'penalty_conceded', type: 'penalty_conceded', key: 'a', label: 'Penalty conceded', personLabel: 'Conceded by', personOptional: true },
    { ...SCORER, id: 'penalty_missed',  type: 'penalty_missed',  key: 'x', label: 'Penalty missed',  personLabel: 'Taker' },
    { ...OPTIONAL_ALL, id: 'highlight', type: 'highlight',       key: 'h', label: 'Highlight',       personLabel: 'Who', askText: 'prompt', textLabel: 'What happened' },
    { ...OPTIONAL_ALL, id: 'foul',      type: 'foul',            key: 'f', label: 'Foul',            personLabel: 'Committed by', textLabel: 'Note' },
    { ...SCORER, id: 'save',            type: 'save',            key: 's', label: 'Save',            personLabel: 'Goalkeeper', personOptional: true },
    // Type-step keys: K, T and W never clash with team shortcuts, which only apply in the team step.
    { ...MARKER, id: 'kick_off',        type: 'kick_off',        key: 'k', label: 'Kick off',        marker: true },
    { ...MARKER, id: 'half_time',       type: 'half_time',       key: 't', label: 'Half time',       marker: true },
    { ...MARKER, id: 'final_whistle',   type: 'final_whistle',   key: 'w', label: 'Final whistle',   marker: true },
]

/** The touch type list: grouped, in this order (Save · Foul · Highlight differs from the keyboard order above). */
export const PICKER_GROUPS: { label: string; ids: PickerOptionId[] }[] = [
    { label: 'Goals', ids: ['goal', 'goal_pen', 'own_goal'] },
    { label: 'Penalties', ids: ['penalty_conceded', 'penalty_missed'] },
    { label: 'Other', ids: ['save', 'foul', 'highlight'] },
    { label: 'Match', ids: ['kick_off', 'half_time', 'final_whistle'] },
]

export function optionForKey(key: string): PickerOption | undefined {
    const k = key.toLowerCase()
    return PICKER_OPTIONS.find((o) => o.key === k)
}

/** Broadcast-style label for outputs: chapters, descriptions, captions. */
export function eventLabel(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    return e.type === 'goal' && e.pen ? 'Goal (pen)' : EVENT_META[e.type].label
}

/** The label in the app's own controls (picker, edit sheet, event log): "Penalty goal", not "Goal (pen)". */
export function controlLabel(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    return e.type === 'goal' && e.pen ? 'Penalty goal' : EVENT_META[e.type].label
}

/**
 * Longest note the note boxes accept: the realistic two-line capacity of a caption (graphics/layout.ts wrapNote). Measured in
 * Chrome with the real fonts at note size (30 px shooot / TNF, 28 px classic) in the caption's widest case (score bug +
 * assist + two note rows): room 1200 px (shooot, TNF) / 1340 px (classic). Characters on two rows, shooot / TNF / classic:
 * "WWWWWWW " words 112 / 99 / 181, "MMMM WWWW" words 120 / 120 / 201, solid W 102 / 94 / 170, average text ~184 / ~157 / ~282.
 * 100 is the tightest realistic figure (TNF, W-heavy words) rounded down to a multiple of 10. Very W-heavy text (100 solid
 * W's) can still end in "…" in TNF. Older or imported notes can be longer and are cut with "…" on screen only.
 * Re-measure with scripts/measure-note-max.mjs when fonts or caption sizes change.
 */
export const NOTE_MAX = 100

/** A note squeezed onto one line, cut at a word with an ellipsis when longer than `max`. */
export function shortNote(notes: string | undefined, max = 40): string {
    const clean = (notes ?? '').trim().replace(/\s+/g, ' ')
    if (clean.length <= max) return clean
    const cut = clean.slice(0, max - 1)
    const space = cut.lastIndexOf(' ')
    return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** One-line description: `Highlight · Sam — nutmeg on the wing`. */
export function eventSummary(e: Pick<MatchEvent, 'type' | 'pen' | 'scorer' | 'assist' | 'notes'>): string {
    const note = shortNote(e.notes)
    return `${eventLabel(e)}${e.scorer ? ` · ${e.scorer}` : ''}${assistOf(e) ? ` (assist ${assistOf(e)})` : ''}${note ? ` — ${note}` : ''}`
}

/** The assist of an event, only where one can exist: a normal goal (not a penalty, not an own goal). */
export function assistOf(e: Pick<MatchEvent, 'type' | 'pen' | 'assist'>): string | undefined {
    const name = e.assist?.trim()
    return e.type === 'goal' && !e.pen && name ? name : undefined
}

/** Event-log row text: `Goal · Sam (assist Jo)` in full, `Goal · Sam, Jo` short (for narrow rows). */
export function controlSummary(e: Pick<MatchEvent, 'type' | 'pen' | 'scorer' | 'assist'>): { full: string; short: string } {
    const base = `${controlLabel(e)}${e.scorer ? ` · ${e.scorer}` : ''}`
    const assist = assistOf(e)
    return assist ? { full: `${base} (assist ${assist})`, short: `${base}, ${assist}` } : { full: base, short: base }
}

export function eventIcon(e: Pick<MatchEvent, 'type'>): string {
    return EVENT_META[e.type].icon
}

export function isScoring(e: Pick<MatchEvent, 'type'>): boolean {
    return EVENT_META[e.type].scoring
}

/** Kick off / Final whistle markers. */
export function isMarker<T extends Pick<MatchEvent, 'type'>>(e: T): e is T & { type: MarkerType } {
    return EVENT_META[e.type].marker === true
}

const EVENT_MARKS: readonly EventMark[] = ['teaser']

export function hasMark(e: Pick<MatchEvent, 'marks'>, m: EventMark): boolean {
    return e.marks?.includes(m) ?? false
}

/** Known marks only, once each; none left (or a marker event) = no `marks` key at all. */
function cleanMarks(raw: unknown, type: EventType): EventMark[] | undefined {
    if (!Array.isArray(raw) || EVENT_META[type].marker) return undefined
    const marks = EVENT_MARKS.filter((m) => raw.includes(m))
    return marks.length ? marks : undefined
}

export const TEASER_CAPTION_MAX = 2 * NOTE_MAX
export const TEASER_SEC_MAX = 15

const clampSec = (n: number) => Math.min(TEASER_SEC_MAX, Math.max(0, n))

/** Known keys only, valid values only; nothing left = undefined. Used for imports and for store edits. */
export function cleanTeaser(raw: unknown, whitesAttackLeft = true): TeaserEdit | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const r = raw as Record<string, unknown>
    const out: TeaserEdit = {}
    if (typeof r.caption === 'string') {
        const c = r.caption.trim().slice(0, TEASER_CAPTION_MAX).trim()
        if (c) out.caption = c
    }
    if (typeof r.beforeSec === 'number' && Number.isFinite(r.beforeSec)) out.beforeSec = clampSec(r.beforeSec)
    if (typeof r.afterSec === 'number' && Number.isFinite(r.afterSec)) out.afterSec = clampSec(r.afterSec)
    if (typeof r.replay === 'boolean') out.replay = r.replay
    const crop = migrateReplayCrop(r.replayCrop, whitesAttackLeft)
    if (crop !== undefined) out.replayCrop = crop
    return Object.keys(out).length ? out : undefined
}

const LEGACY_TYPES: Record<string, EventType> = { moment: 'highlight', card: 'foul', kickoff: 'kick_off', kickOff: 'kick_off', halftime: 'half_time', halfTime: 'half_time', finalWhistle: 'final_whistle' }

/** `whitesAttackLeft`: the old direction flag, needed only to turn a stored 'left' / 'right' replay framing into a team's goal. */
export function migrateEvent(raw: Omit<MatchEvent, 'type' | 'replayCrop' | 'marks' | 'teaser'> & { type?: string; replayCrop?: unknown; marks?: unknown; teaser?: unknown }, whitesAttackLeft = true, teams: Team[] = []): MatchEvent {
    if (raw.type === 'penalty_awarded') return migrateEvent(awardedToConceded(raw, teams), whitesAttackLeft, teams)
    const t = raw.type ?? 'goal'
    const type = (LEGACY_TYPES[t] ?? (t in EVENT_META ? t : 'highlight')) as EventType
    const { replayCrop, marks, teaser, ...rest } = raw
    const crop = migrateReplayCrop(replayCrop, whitesAttackLeft)
    const cleaned = cleanMarks(marks, type)
    const cleanedTeaser = cleaned?.includes('teaser') ? cleanTeaser(teaser, whitesAttackLeft) : undefined
    return { ...rest, type, ...(crop !== undefined ? { replayCrop: crop } : {}), ...(cleaned ? { marks: cleaned } : {}), ...(cleanedTeaser ? { teaser: cleanedTeaser } : {}) }
}

/**
 * "Penalty awarded" (team = the team awarded it) became "Penalty conceded" (team = the team that conceded it):
 * the team flips to the other of two teams, and a person from the awarding roster is cleared (they were the wrong team's player).
 */
function awardedToConceded<T extends { team?: string; scorer?: string }>(raw: T, teams: Team[]): T & { type: 'penalty_conceded' } {
    const out = { ...raw, type: 'penalty_conceded' as const }
    const idx = raw.team ? teams.findIndex((t) => t.name === raw.team) : -1
    if (teams.length !== 2 || idx < 0) return out
    out.team = teams[1 - idx].name
    const person = raw.scorer?.trim().toLowerCase()
    if (person && teams[idx].roster.some((r) => r.trim().toLowerCase() === person)) delete out.scorer
    return out
}

/**
 * Events from saved state, a project file or a transfer link: known aliases are mapped (`kickoff` → `kick_off`), anything that
 * isn't an event or has a type this version doesn't know is dropped, so one odd event never takes the page down.
 */
export function sanitiseEvents(raw: unknown, whitesAttackLeft = true, teams: Team[] = []): MatchEvent[] {
    if (!Array.isArray(raw)) return []
    const known = (t: unknown): boolean => t === undefined || (typeof t === 'string' && (t in EVENT_META || t in LEGACY_TYPES || t === 'penalty_awarded'))
    return raw
        .filter((e): e is Parameters<typeof migrateEvent>[0] => !!e && typeof e === 'object' && known((e as { type?: unknown }).type))
        .map((e) => migrateEvent(e, whitesAttackLeft, teams))
}
