import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { KeepType, Suggestion } from '../types'
import { formatClock } from '../utils/timeline'
import { seekPlayerPaused, stepPlayer, togglePlayerPlayback, usePlayerPaused } from './playerControl'
import { AUDIO_DETECT } from '../detect/detectConfig'
import { formatReviewWindow, withTenths } from '../utils/reviewLoop'
import { globalToFileTime } from '../utils/matchStrip'
import {
    EMPTY_DECISION, canConfirm, confirmLabel, decisionReducer, instructionText, needsTeam, type ReviewType,
} from '../utils/reviewMark'
import { useReviewLoop } from './useReviewLoop'
import { useMarkedMoment } from './useMarkedMoment'
import { ReviewTimeline } from './ReviewTimeline'
import { EventIcon } from './icons/EventIcon'

interface SuggestionCardProps {
    suggestion: Suggestion
    index: number
    total: number
    /** Next suggestion (Skip / Next, →). */
    onNext: () => void
    onPrev: () => void
    /** After Save: the next suggestion still to review. */
    onSaved: () => void
    /** Team pre-selected after Goal / Own goal, so Enter saves with it (defaults to the first team). */
    preselectTeam?: string
    /** Type pre-selected once the moment is settled (marked or estimate accepted), so Enter saves it. */
    preselectType?: KeepType
    /** One optional line above the actions, e.g. "Ball in Colours' goal". */
    hint?: ReactNode
}

const TYPES: { type: KeepType; label: string; key: string }[] = [
    { type: 'goal', label: 'Goal', key: 'G' }, { type: 'own_goal', label: 'Own goal', key: 'O' },
    { type: 'save', label: 'Save', key: 'S' }, { type: 'highlight', label: 'Highlight', key: 'H' },
]
const TYPE_LABEL: Record<KeepType, string> = { goal: 'Goal', own_goal: 'Own goal', save: 'Save', highlight: 'Highlight' }
const KEY_TO_TYPE: Record<string, ReviewType> = { g: 'goal', o: 'own_goal', s: 'save', h: 'highlight', x: 'reject' }

function Chevron({ dir }: { dir: 'left' | 'right' }) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
        </svg>
    )
}

/**
 * One suggested moment, one step at a time: watch and mark the exact moment, say what it was (and which team), then
 * save. Keys and buttons only select; Save (Enter) confirms and moves on. Finished steps fold into a chip that reopens them.
 */
export function SuggestionCard({ suggestion, index, total, onNext, onPrev, onSaved, preselectTeam, preselectType, hint }: SuggestionCardProps) {
    const teams = useAppState((s) => s.teams)
    const kickOff = useAppState(selectMatchStartSec)
    const long = useAppState(selectClockLong)
    const paused = usePlayerPaused()
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
    const [acceptedEstimate, setAcceptedEstimate] = useState(false)
    const [remarking, setRemarking] = useState(false)
    useEffect(() => {
        dispatch({ kind: 'clear' })
        setAcceptedEstimate(false)
        setRemarking(false)
        const keptAs = savedEvent && (TYPE_LABEL as Record<string, string>)[savedEvent.type] ? savedEvent.type as KeepType : null
        if (keptAs || rejected) {
            touchedFor.current = suggestion.id // the saved choice stands: no pre-selection over it
            dispatch({ kind: 'type', type: keptAs ?? 'reject', defaultTeam: savedEvent?.team ?? null })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the suggestion changes
    }, [suggestion.id])

    const preselectedFor = useRef<string | null>(null)
    const [armedFor, setArmedFor] = useState<string | null>(null)
    const teamCount = teams.length
    const defaultTeam = teamCount >= 2 ? preselectTeam ?? teams[0]?.name ?? null : null
    const marked = moment.markedSec !== null
    const clock = (sec: number): string => withTenths((w) => formatClock(w, long), sec - kickOff)
    const savedSec = moment.markedSec ?? estimateSec
    const instruction = instructionText({ marked, decision, teamCount, clock: clock(savedSec) })

    const mark = (): void => { moment.mark(); setRemarking(false) }
    const step = (kind: 'frame' | 'second', dir: 1 | -1): void => { moment.followPlayhead(); stepPlayer(kind, dir) }
    const select = (type: ReviewType): void => touch({ kind: 'type', type, defaultTeam })
    const confirm = (): void => {
        if (!canConfirm(decision, teamCount) || decision.type === null) return
        const st = useAppState.getState()
        if (decision.type === 'reject') st.decideSuggestion(suggestion.id, { kind: 'reject' })
        else st.decideSuggestion(suggestion.id, { kind: 'keep', type: decision.type, atSec: moment.current() ?? estimateSec, ...(decision.team ? { team: decision.team } : {}) })
        touch({ kind: 'clear' })
        onSaved()
    }
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
            const arrow = e.key === 'ArrowUp' || e.key === 'ArrowDown'
            if (e.shiftKey && !arrow) return // only the arrows read Shift
            if (arrow) { e.preventDefault(); step(e.shiftKey ? 'second' : 'frame', e.key === 'ArrowUp' ? 1 : -1); return }
            if (e.repeat) return
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
            const type = KEY_TO_TYPE[k]
            if (type) { e.preventDefault(); select(type); return }
            if (e.key === '[') { e.preventDefault(); loop.earlier(); return }
            if (e.key === ']') { e.preventDefault(); loop.later(); return }
            if (e.key === 'ArrowRight') { e.preventDefault(); onNext() }
            if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev() }
        }
        // A button activates on Space's key-up: stop that too.
        const onKeyUp = (e: KeyboardEvent): void => {
            if (e.key === ' ' && !(e.target as HTMLElement | null)?.closest?.('input, textarea, select')) e.preventDefault()
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKeyUp)
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
    })

    const sure = marked || acceptedEstimate // the moment step is done
    // Once per suggestion, when the moment is settled; clearing the choice afterwards stays cleared.
    useEffect(() => {
        // Right after the suggestion changed, `sure` still belongs to the previous one: wait for the reset render.
        if (armedFor !== suggestion.id) { setArmedFor(suggestion.id); return }
        if (preselectType && sure && preselectedFor.current !== suggestion.id && touchedFor.current !== suggestion.id && decision.type === null) { preselectedFor.current = suggestion.id; select(preselectType) }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `select` only dispatches
    }, [armedFor, suggestion.id, preselectType, sure, decision.type])
    const showMarkStep = !sure && decision.type === null || remarking
    const showTypeStep = !showMarkStep && decision.type === null
    const hasChoice = decision.type !== null
    const teamStep = needsTeam(decision.type, teamCount)

    return (
        <div className="rv" data-esc-clears={hasChoice ? '' : undefined}>
            <header className="rv__head">
                <p className="review__count">Suggestion {index + 1} of {total} · <span className="tc">{formatClock(Math.max(0, suggestion.globalTimeSec - kickOff), long)}</span></p>
                <div className="rv__nav">
                    <button type="button" className="rv__icon" aria-label="Previous suggestion" onClick={onPrev} disabled={index === 0}><Chevron dir="left" /></button>
                    <button type="button" className="rv__skip" onClick={onNext}>{savedEvent || rejected ? 'Next' : 'Skip'} <Chevron dir="right" /></button>
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
                <p className="rv__say" role="status" aria-live="polite">{instruction.text}</p>
                {instruction.warning && <p className="rv__warn">{instruction.warning}</p>}
            </section>

            {hint && <div className="rv__hint">{hint}</div>}

            <section className="rv__steps" aria-label="Decide">
                {showMarkStep ? (
                    <>
                        <button type="button" className="rv__mark" onClick={mark}>
                            <span className="rv__dot" aria-hidden="true" />Mark moment <kbd>M</kbd>
                        </button>
                        {!remarking && <button type="button" className="rv__link" onClick={() => setAcceptedEstimate(true)}>Use the estimate instead</button>}
                    </>
                ) : (
                    <div className="rv__chips">
                        <button type="button" className="rv__chip" onClick={() => { setRemarking(true); setAcceptedEstimate(false) }}>
                            <EventIcon event={{ type: 'goal' }} size={18} decorative />
                            <span className="tc">{clock(savedSec)}</span> <span className="rv__chipnote">{marked ? 'marked' : 'estimate'}</span> <span aria-hidden="true">✎</span>
                            <span className="sr-only">Mark again</span>
                        </button>
                        {hasChoice && (
                            <button type="button" className="rv__chip" onClick={() => touch({ kind: 'clear' })} aria-label="Change what it was">
                                {decision.type === 'reject' ? 'Not a goal' : TYPE_LABEL[decision.type as KeepType]}{decision.team && decision.type !== 'reject' ? ` · ${decision.team}` : ''} <span aria-hidden="true">✎</span>
                            </button>
                        )}
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
                        <button type="button" className="rv__link" onClick={() => select('reject')}>Not a goal <kbd>X</kbd></button>
                    </div>
                )}

                {teamStep && (
                    <div className="rv__seg rv__seg--team" role="group" aria-label="Which team scored?">
                        {teams.slice(0, 2).map((t, i) => (
                            <button key={i} type="button" className="rv__choice" aria-pressed={decision.team === t.name} onClick={() => touch({ kind: 'team', team: t.name })}>
                                {t.name} <kbd>{i + 1}</kbd>
                            </button>
                        ))}
                    </div>
                )}

                {hasChoice && (
                    <button type="button" className="btn-primary rv__save" disabled={!canConfirm(decision, teamCount)} onClick={confirm}>
                        {confirmLabel(decision.type, marked)} <kbd>⏎</kbd>
                    </button>
                )}
            </section>
        </div>
    )
}
