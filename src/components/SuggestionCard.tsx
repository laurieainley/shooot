import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { KeepType, Suggestion } from '../types'
import { formatClock } from '../utils/timeline'
import { runPlayerShortcut, seekPlayerPaused, stepPlayer, togglePlayerPlayback, usePlayerPaused } from './playerControl'
import { AUDIO_DETECT } from '../detect/detectConfig'
import { formatReviewWindow, withTenths } from '../utils/reviewLoop'
import { globalToFileTime } from '../utils/matchStrip'
import {
    EMPTY_DECISION, canConfirm, confirmLabel, decisionReducer, instructionText, needsTeam, type ReviewType,
} from '../utils/reviewMark'
import { showToast } from '../toasts'
import { confirmedCopy, discardedCopy, matchClock } from '../utils/toastCopy'
import { shortcutFor } from '../utils/shortcuts'
import { NO_PEOPLE, peopleCandidates, peopleDisabled, peopleLabel, peopleOpen, reopenPeople, startPeople, stepPeople, type PeopleState } from '../utils/reviewPeople'
import { PersonStep } from './PersonStep'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'
import { useReviewLoop } from './useReviewLoop'
import { useMarkedMoment } from './useMarkedMoment'
import { ReviewTimeline } from './ReviewTimeline'
import { EventIcon } from './icons/EventIcon'

interface SuggestionCardProps {
    suggestion: Suggestion
    index: number
    total: number
    /** Next moment (Next, →) — only moves, never decides. */
    onNext: () => void
    onPrev: () => void
    /** After Confirm or Discard: the next suggestion still to review. */
    onSaved: () => void
    /** Type pre-selected once the moment is settled (marked), so Enter saves it. */
    preselectType?: KeepType
    /** One optional line above the actions, e.g. "Ball in Colours' goal". */
    hint?: ReactNode
}

const TYPES: { type: KeepType; label: string; key: string }[] = [
    { type: 'goal', label: 'Goal', key: 'G' }, { type: 'own_goal', label: 'Own goal', key: 'O' },
    { type: 'save', label: 'Save', key: 'S' }, { type: 'highlight', label: 'Highlight', key: 'H' },
]
const TYPE_LABEL: Record<KeepType, string> = { goal: 'Goal', own_goal: 'Own goal', save: 'Save', highlight: 'Highlight' }
const KEY_TO_TYPE: Record<string, ReviewType> = { g: 'goal', o: 'own_goal', s: 'save', h: 'highlight' }

function Chevron({ dir }: { dir: 'left' | 'right' }) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
        </svg>
    )
}

/**
 * One suggested moment, one step at a time: watch and mark the exact moment, say what it was (and which team), then
 * confirm. Keys and buttons only select; Confirm (Enter) saves and moves on, Discard (X) drops it and moves on.
 * Previous / Next only move. Finished steps fold into a chip that reopens them.
 */
export function SuggestionCard({ suggestion, index, total, onNext, onPrev, onSaved, preselectType, hint }: SuggestionCardProps) {
    const teams = useAppState((s) => s.teams)
    const kickOff = useAppState(selectMatchStartSec)
    const long = useAppState(selectClockLong)
    const paused = usePlayerPaused()
    const coarse = useMediaQuery(COARSE_QUERY)
    const playheadSec = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const estimateSec = Math.max(0, suggestion.globalTimeSec + AUDIO_DETECT.eventOffsetSec)
    const loop = useReviewLoop(suggestion.globalTimeSec)
    // Coming back to a decided suggestion: its saved event (moment, type, team), or the rejection.
    const savedEvent = useAppState((s) => (suggestion.eventId ? s.events.find((e) => e.id === suggestion.eventId) : undefined))
    const savedEventSec = useAppState((s) => (savedEvent ? (s.cumulativeOffsets[savedEvent.sourceFileIndex ?? 0] ?? 0) + savedEvent.matchTimeSec : null))
    const rejected = !savedEvent && suggestion.status === 'rejected'
    const moment = useMarkedMoment(suggestion.id, savedEventSec)
    const [decision, dispatch] = useReducer(decisionReducer, EMPTY_DECISION)
    // Once the user has touched the selection on this card (chose, changed or cleared), a late ball tag must not choose for them.
    const touchedFor = useRef<string | null>(null)
    const touch = (a: Parameters<typeof dispatch>[0]): void => { touchedFor.current = suggestion.id; dispatch(a) }
    // Optional scorer / assist after type and team (the event picker's own steps).
    const [people, setPeople] = useState<PeopleState>(NO_PEOPLE)
    useEffect(() => {
        dispatch({ kind: 'clear' })
        const keptAs = savedEvent && (TYPE_LABEL as Record<string, string>)[savedEvent.type] ? savedEvent.type as KeepType : null
        if (keptAs || rejected) {
            touchedFor.current = suggestion.id // the saved choice stands: no pre-selection over it
            if (keptAs) dispatch({ kind: 'type', type: keptAs, defaultTeam: savedEvent?.team ?? null })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the suggestion changes
    }, [suggestion.id])

    useEffect(() => {
        const fresh = startPeople(decision.type, decision.team, teams.length)
        const same = !!savedEvent && savedEvent.type === decision.type && (savedEvent.team ?? null) === decision.team
        setPeople(fresh.pk && same ? { ...fresh, pk: { ...fresh.pk, step: 'text' }, scorer: savedEvent.scorer, assist: savedEvent.assist } : fresh)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- when the choice or the suggestion changes
    }, [suggestion.id, decision.type, decision.team])

    const preselectedFor = useRef<string | null>(null)
    const [armedFor, setArmedFor] = useState<string | null>(null)
    const teamCount = teams.length
    const marked = moment.markedSec !== null
    const clock = (sec: number): string => withTenths((w) => formatClock(w, long), sec - kickOff)
    // Nobody marked it yet: the time shown (and saved, if you go ahead anyway) is wherever the playhead is.
    const savedSec = moment.markedSec ?? playheadSec
    // Touch: no key hints. Once marked, the marked line below says the time, so the instruction is screen-reader only.
    const instruction = instructionText({ marked, decision, teamCount, clock: clock(savedSec), touch: coarse })
    const sayText = instruction.text
    const stepsRef = useRef<HTMLElement | null>(null)

    const mark = (): void => { moment.mark() }
    const step = (kind: 'frame' | 'second', dir: 1 | -1): void => { moment.followPlayhead(); stepPlayer(kind, dir) }
    const select = (type: ReviewType): void => touch({ kind: 'type', type })
    const confirm = (): void => {
        if (!canConfirm(decision, teamCount) || decision.type === null) return
        const st = useAppState.getState()
        const atSec = moment.current() ?? savedSec
        for (const a of people.adds) st.addToRoster(a.team, a.name)
        st.decideSuggestion(suggestion.id, { kind: 'keep', type: decision.type, atSec, ...(decision.team ? { team: decision.team } : {}), ...(people.scorer ? { scorer: people.scorer } : {}), ...(people.assist ? { assist: people.assist } : {}) })
        showToast(confirmedCopy(decision.type, decision.team ?? undefined, matchClock(atSec, kickOff, long), people.scorer))
        touch({ kind: 'clear' })
        onSaved()
    }
    const discard = (): void => {
        const id = suggestion.id
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        showToast(discardedCopy(matchClock(estimateSec, kickOff, long)), { label: 'Undo', run: () => { useAppState.getState().undoDiscard(id) } })
        touch({ kind: 'clear' })
        onSaved()
    }
    const restore = (): void => { useAppState.getState().restoreSuggestion(suggestion.id) }
    const scrub = (sec: number): void => {
        const st = useAppState.getState()
        const at = globalToFileTime(st.cumulativeOffsets, st.files.map((f) => f.durationSec ?? 0), sec)
        moment.scrubbed()
        seekPlayerPaused(at.fileIndex, at.timeSec)
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const target = e.target as HTMLElement | null
            if (target?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
            if ((e.key === '{' || e.key === '}') && !e.repeat) { e.preventDefault(); if (e.key === '{') loop.earlier(); else loop.later(); return } // Shift+[ / Shift+]
            const arrow = e.key === 'ArrowUp' || e.key === 'ArrowDown'
            const sideways = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
            if (e.shiftKey && !arrow && !sideways) return // only the arrows read Shift
            if (arrow) { e.preventDefault(); step(e.shiftKey ? 'second' : 'frame', e.key === 'ArrowUp' ? 1 : -1); return }
            if (e.repeat && !sideways) return
            const k = e.key.toLowerCase()
            const button = target?.closest?.('button') ?? null
            const onButton = !!button
            // Space only plays / pauses the clip, even on a focused button (which would otherwise repeat its last click).
            if (e.key === ' ') { e.preventDefault(); togglePlayerPlayback(); return }
            if (e.key === 'Enter') {
                if (onButton && !button.classList.contains('rv__choice')) return // other buttons act on Enter themselves
                if (canConfirm(decision, teamCount)) { e.preventDefault(); confirm() }
                return
            }
            if (e.key === 'Escape' || e.key === 'Backspace') {
                if (decision.type !== null) { e.preventDefault(); touch({ kind: 'clear' }) }
                return
            }
            if (k === 'm') { e.preventDefault(); mark(); return }
            if (needsTeam(decision.type, teamCount) && (k === '1' || k === '2') && teams[Number(k) - 1]) {
                e.preventDefault(); touch({ kind: 'team', team: teams[Number(k) - 1].name }); return
            }
            if (k === 'x') { e.preventDefault(); if (!rejected) discard(); return }
            const type = KEY_TO_TYPE[k]
            // A type key before marking marks the playhead first (same result as M then the key); once marked it only sets the type.
            if (type) { e.preventDefault(); if (moment.current() === null) mark(); select(type); return }
            // [ ] move between suggestions here (elsewhere they step between files); ← → seek like the editor.
            if (e.key === '[') { e.preventDefault(); if (index > 0) onPrev(); return }
            if (e.key === ']') { e.preventDefault(); onNext(); return }
            if (sideways || k === ',' || k === '.' || k === '/') {
                const action = shortcutFor(e)
                // Seeking and speed never mark: only M, the button and frame steps do (a mark that is following the playhead keeps following).
                if (action) { e.preventDefault(); runPlayerShortcut(action) }
            }
        }
        // A button activates on Space's key-up: stop that too.
        const onKeyUp = (e: KeyboardEvent): void => {
            if (e.key === ' ' && !(e.target as HTMLElement | null)?.closest?.('input, textarea, select')) e.preventDefault()
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKeyUp)
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
    })

    const sure = marked // the moment step is done
    // Once per suggestion, when the moment is settled; clearing the choice afterwards stays cleared.
    useEffect(() => {
        // Right after the suggestion changed, `sure` still belongs to the previous one: wait for the reset render.
        if (armedFor !== suggestion.id) { setArmedFor(suggestion.id); return }
        if (preselectType && sure && preselectedFor.current !== suggestion.id && touchedFor.current !== suggestion.id && decision.type === null) { preselectedFor.current = suggestion.id; select(preselectType) }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `select` only dispatches
    }, [armedFor, suggestion.id, preselectType, sure, decision.type])
    const showTypeStep = sure && decision.type === null
    const hasChoice = decision.type !== null
    const teamStep = needsTeam(decision.type, teamCount)
    // When a step completes the next one may be below the fold: bring it into view (the action bar is sticky, scroll-padding covers it).
    const personStep = people.pk?.step ?? null
    const firstStepRun = useRef(true)
    useEffect(() => {
        if (firstStepRun.current) { firstStepRun.current = false; return }
        if (!coarse) return
        stepsRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' })
    }, [coarse, marked, decision.type, decision.team, personStep])

    return (
        <div className="rv" data-esc-clears={hasChoice ? '' : undefined}>
            <header className="rv__head">
                <p className="review__count">Moment {index + 1} of {total}<span className="rv__momentclock"> · <span className="tc">{formatClock(Math.max(0, suggestion.globalTimeSec - kickOff), long)}</span></span></p>
                <div className="rv__nav">
                    <button type="button" className="rv__step" aria-label="Previous moment" title="Previous moment ([)" onClick={onPrev} disabled={index === 0}><Chevron dir="left" />Previous</button>
                    <button type="button" className="rv__step" aria-label="Next moment" title="Next moment (])" onClick={onNext}>Next<Chevron dir="right" /></button>
                </div>
            </header>

            <section className="rv__watch" aria-label="Find the moment">
                <div className="rv__clock">
                    <button type="button" className="rv__icon" aria-label="Back one frame" disabled={!paused} onClick={() => step('frame', -1)}><Chevron dir="left" /></button>
                    <span className="rv__time tc" aria-label="Playhead time">{clock(playheadSec)}</span>
                    <button type="button" className="rv__icon" aria-label="Forward one frame" disabled={!paused} onClick={() => step('frame', 1)}><Chevron dir="right" /></button>
                </div>
                {loop.window && (
                    <ReviewTimeline window={loop.window} estimateSec={estimateSec} playheadSec={playheadSec} markedSec={moment.markedSec}
                        format={clock} onScrub={scrub} onEarlier={loop.earlier} onLater={loop.later} />
                )}
                {loop.window && <span className="sr-only">{formatReviewWindow(suggestion.globalTimeSec, loop.window)}</span>}
                {/* Once marked the marked line below says the time; the instruction stays for screen readers only. */}
                <p className={marked ? 'sr-only' : 'rv__say'} role="status" aria-live="polite">{sayText}</p>
                {instruction.warning && <p className="rv__warn">{instruction.warning}</p>}
            </section>

            {hint && <div className="rv__hint">{hint}</div>}

            <section ref={stepsRef} className="rv__steps" aria-label="Decide">
                {sure && (
                    <div className="rv__moment">
                        <p className="rv__momentline m-0">
                            <EventIcon event={{ type: 'goal' }} size={18} decorative />
                            <span className="tc rv__momentat">{clock(savedSec)}</span> <span className="rv__chipnote">marked</span>
                            <button type="button" className="rv__link" title="Mark again at the playhead (M)" onClick={mark}>Mark again</button>
                        </p>
                    </div>
                )}
                {rejected && (
                    <div className="rv__discarded">
                        <span className="rv__discardednote">Discarded</span>
                        <button type="button" className="rv__quiet" onClick={restore}>Restore</button>
                    </div>
                )}
                {hasChoice && (
                    <div className="rv__chips">
                        <button type="button" className="rv__chip" onClick={() => touch({ kind: 'clear' })} aria-label="Change what it was">
                            {TYPE_LABEL[decision.type as KeepType]}{decision.team ? ` · ${decision.team}` : ''} <span aria-hidden="true">✎</span>
                        </button>
                    </div>
                )}

                {showTypeStep && (
                    <div className="rv__type">
                        <div className="rv__seg" role="group" aria-label="What was it?">
                            {TYPES.map((t) => (
                                <button key={t.type} type="button" className="rv__choice" aria-pressed={decision.type === t.type} onClick={() => select(t.type)}>
                                    {t.type === 'goal' && <EventIcon event={{ type: 'goal' }} size={16} decorative />}{t.label} <kbd>{t.key}</kbd>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {teamStep && (
                    <div className="rv__seg rv__seg--team" role="group" aria-label={decision.type === 'save' ? 'Which team made the save?' : 'Which team scored?'}>
                        {teams.slice(0, 2).map((t, i) => (
                            <button key={i} type="button" className="rv__choice" aria-pressed={decision.team === t.name} onClick={() => touch({ kind: 'team', team: t.name })}>
                                {t.name} <kbd>{i + 1}</kbd>
                            </button>
                        ))}
                    </div>
                )}

                {peopleOpen(people) && (
                    <div data-owns-escape="">
                    <PersonStep key={people.pk?.step} label={peopleLabel(people)} autoFocus={!coarse} chips={coarse} showLabel
                        skipLabel={people.pk?.step === 'assist' ? 'No assist' : 'Skip'}
                        onSkip={() => setPeople((p) => stepPeople(p, { kind: 'key', key: 'Tab' }, teams))}
                        placeholder={coarse ? 'Type a new name' : `${peopleLabel(people)} (optional) — type to filter, Enter to pick, Tab to skip`}
                        query={people.pk?.query ?? ''} candidates={peopleCandidates(people, teams)} highlighted={people.pk?.highlighted ?? 0} showHighlight isDisabled={(n) => peopleDisabled(people, n)}
                        onQuery={(value) => setPeople((p) => stepPeople(p, { kind: 'text', value }, teams))}
                        onChoose={(value) => setPeople((p) => stepPeople(p, { kind: 'choose', value }, teams))}
                        onKeyDown={(e) => {
                            // Typing is text here; Enter picks / skips, Tab and Esc skip, the arrows move.
                            if (['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setPeople((p) => stepPeople(p, { kind: 'key', key: e.key === 'Escape' ? 'Tab' : e.key }, teams)) }
                        }} />
                    </div>
                )}
                {!peopleOpen(people) && (people.scorer || people.assist) && (
                    <div className="rv__chips">
                        <button type="button" className="rv__chip" aria-label="Change scorer and assist" onClick={() => setPeople((p) => reopenPeople(p))}>
                            <span className="voice-shirt">{people.scorer}</span>{people.assist ? <span className="rv__chipnote"> · assist {people.assist}</span> : null} <span aria-hidden="true">✎</span>
                        </button>
                    </div>
                )}

            </section>
            <div className="rv__decide">
                {marked || hasChoice ? (
                    <button type="button" className="btn-primary rv__save" disabled={!canConfirm(decision, teamCount)} onClick={confirm}>
                        {confirmLabel()} <kbd>⏎</kbd>
                    </button>
                ) : (
                    <button type="button" className="btn-primary rv__save" onClick={mark}>
                        <span className="rv__dot" aria-hidden="true" />Mark moment <kbd>M</kbd>
                    </button>
                )}
                {!rejected && (
                    <button type="button" className="rv__quiet rv__discard" onClick={discard}>Discard <kbd>X</kbd></button>
                )}
            </div>
        </div>
    )
}
