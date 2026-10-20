import { teamBackground } from '../utils/teamColor'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import { showToast } from '../toasts'
import { effectiveStatus } from '../utils/suggestions'
import { getReviewWindow } from './reviewWindowState'
import { confirmedCopy, eventGlobalSec, matchClock, taggedCopy } from '../utils/toastCopy'
import { nearbyMark } from '../utils/duplicates'
import { EventTag } from './EventTag'
import { PersonStep } from './PersonStep'
import { TagColumn } from './TagColumn'
import { breadcrumbs, nearWarning, questionFor } from '../utils/tagFlow'
import { useTagViewMode } from './tagView'
import { momentAt } from '../utils/foundMoments'
import { pendingMoments } from '../utils/tagView'
import { PICKER_GROUPS, PICKER_OPTIONS, assistOf, isMarker, controlLabel, type PickerOption } from '../utils/eventTypes'
import { SKIP, initialPickerState, pickerReducer, touchPickerState, scorerCandidates, isDisabledName, type PickerInput, type PickerState } from '../utils/eventPicker'
import { teamShortcuts } from '../utils/roster'
import { formatClock } from '../utils/timeline'
import type { MatchEvent } from '../types'
import { panelPlacement, usePanelSlot } from './panelSlot'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

const HANDLED = new Set(['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Backspace', 'Tab'])

const startState = (pending: boolean): PickerState => (pending ? touchPickerState : initialPickerState)

export function EventPicker() {
    const picker = useAppState((s) => s.picker)
    const clockLong = useAppState(selectClockLong)
    const storedEvent = useAppState((s) => s.events.find((e) => e.id === s.picker?.eventId))
    const teams = useAppState((s) => s.teams)
    const events = useAppState((s) => s.events)
    const storeFullscreen = useAppState((s) => s.playerFullscreen || s.immersive)
    // The immersive touch view puts the picture full screen even outside fullscreen: the column then sits over the picture.
    const tagViewMode = useTagViewMode()
    const fullscreen = storeFullscreen || tagViewMode === 'overlay'
    const slot = usePanelSlot((s) => s.el)
    const coarse = useMediaQuery(COARSE_QUERY)
    const placement = panelPlacement(coarse, fullscreen)
    // A touch mark has no event until a type is chosen: show it as a draft.
    const pending = picker?.pending
    const event: MatchEvent | undefined = useMemo(
        () => storedEvent ?? (picker && pending ? { id: picker.eventId, ...pending, type: 'goal' } : undefined),
        [storedEvent, picker, pending],
    )
    // Duplicate-mark guard: a second mark within 3 s is usually a double G / double tap.
    const near = useMemo(() => (picker ? nearbyMark(events, picker.eventId, undefined, pending) : null), [events, picker, pending])
    const [state, setState] = useState<PickerState>(() => startState(!!pending))
    const stateRef = useRef(state)
    stateRef.current = state

    // Names typed in during this tag: they sit after the A–Z names so the grid never reorders while tagging.
    const [added, setAdded] = useState<string[]>([])
    useEffect(() => { setState(startState(!!useAppState.getState().picker?.pending)); setAdded([]) }, [picker?.eventId])

    // Closing a fresh tag announces it (with Undo); closing an edit, a marker or an empty mark says nothing here.
    const finish = (fresh: boolean, id: string): void => {
        const st = useAppState.getState()
        const e = st.events.find((x) => x.id === id)
        st.closePicker()
        if (!fresh || !e || isMarker(e)) return
        const kick = selectMatchStartSec(st)
        // Tagged while reviewing, inside the current suggestion's loop: it counts for that suggestion, like Confirm.
        const sug = st.panel === 'review' ? st.suggestions[st.reviewIndex] : undefined
        const taken = !!sug && effectiveStatus(sug, new Set(st.events.map((x) => x.id))) === 'kept' // already confirmed: leave it, no duplicate link
        // Touch view (no review card): tagging while on a pending found moment resolves it, like Confirm.
        if (tagViewMode !== 'off' && (e.type === 'goal' || e.type === 'own_goal' || e.type === 'save' || e.type === 'highlight')) {
            const at = eventGlobalSec(e, st.cumulativeOffsets)
            const onMoment = momentAt(pendingMoments(st.suggestions, new Set(st.events.map((x) => x.id))), at)
            if (onMoment) {
                st.linkSuggestionEvent(onMoment.id, id)
                showToast(confirmedCopy(e.type, e.team, matchClock(at, kick, selectClockLong(st))),
                    { label: 'Undo', run: () => { const s2 = useAppState.getState(); if (s2.events.some((x) => x.id === id)) s2.removeEvent(id) } })
                return
            }
        }
        if (sug && !taken && (e.type === 'goal' || e.type === 'own_goal' || e.type === 'save' || e.type === 'highlight')) {
            const w = getReviewWindow()
            const at = eventGlobalSec(e, st.cumulativeOffsets)
            if (w && at >= w.startAbs && at <= w.endAbs) {
                st.linkSuggestionEvent(sug.id, id)
                showToast(confirmedCopy(e.type, e.team, matchClock(at, kick, selectClockLong(st))))
                return
            }
        }
        // No note yet: the toast offers to add one (the optional note step is skipped on touch). Does nothing if the event is gone.
        const addNote = e.notes ? undefined : { label: 'Add note', run: () => { const s2 = useAppState.getState(); if (s2.events.some((x) => x.id === id)) s2.editEvent(id, 'details', { focus: 'note' }) } }
        showToast(taggedCopy(e.type, e.team, matchClock(eventGlobalSec(e, st.cumulativeOffsets), kick, selectClockLong(st))),
            { label: 'Undo', run: () => { const s2 = useAppState.getState(); if (s2.events.some((x) => x.id === id)) s2.removeEvent(id) } }, addNote)
    }

    const dispatch = (input: PickerInput): void => {
        const store = useAppState.getState()
        const current = store.picker
        if (!current) return
        const id = current.eventId
        if (coarse && input.kind === 'choose' && input.value !== SKIP && (stateRef.current.step === 'scorer' || stateRef.current.step === 'assist')) {
            const roster = scorerCandidates({ ...stateRef.current, query: '' }, { teams: store.teams, touch: coarse })
            const name = input.value.trim()
            if (name && !roster.some((r) => r.toLowerCase() === name.toLowerCase())) setAdded((a) => [...a, name])
        }
        const { state: next, effects } = pickerReducer(stateRef.current, input, { teams: store.teams, touch: coarse })
        stateRef.current = next
        setState(next)
        // The first real choice creates the event (one undo step); closing without one creates nothing.
        if (current.pending && effects.some((fx) => fx.kind === 'update' || fx.kind === 'marker')) store.commitPending()
        for (const fx of effects) {
            if (fx.kind === 'update') store.updateEvent(id, fx.patch)
            else if (fx.kind === 'remove') { if (useAppState.getState().events.some((e) => e.id === id)) store.removeEvent(id) }
            else if (fx.kind === 'addToRoster') store.addToRoster(fx.team, fx.name)
            else if (fx.kind === 'marker') store.placeMarker(id, fx.type)
            else finish(current.fresh === true, id)
        }
    }

    const dispatchRef = useRef(dispatch)
    dispatchRef.current = dispatch

    const cancel = (): void => {
        const store = useAppState.getState()
        const id = store.picker?.eventId
        if (id && store.events.some((e) => e.id === id)) store.removeEvent(id)
        else store.closePicker()
    }

    // The scorer field takes focus and then unmounts; give focus back (normally the
    // video.js element) so focus is not left on nothing.
    const isOpen = picker !== null
    useEffect(() => {
        if (!isOpen) return
        const previous = document.activeElement
        return () => {
            const lost = !document.activeElement || document.activeElement === document.body
            if (lost && previous instanceof HTMLElement && previous.isConnected) previous.focus()
        }
    }, [isOpen])

    useEffect(() => {
        if (!picker) return
        const onKey = (e: KeyboardEvent): void => {
            if (e.metaKey || e.ctrlKey || e.altKey) return
            e.stopImmediatePropagation()
            const step = stateRef.current.step
            const inText = step === 'scorer' || step === 'assist' || step === 'text'
            const isLetter = e.key.length === 1
            const caretKey = step === 'text' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')
            if (HANDLED.has(e.key) && !(inText && e.key === 'Backspace') && !caretKey) {
                e.preventDefault()
                dispatchRef.current({ kind: 'key', key: e.key })
            } else if (isLetter && !inText) {
                e.preventDefault()
                dispatchRef.current({ kind: 'key', key: e.key })
            }
            // letters in the scorer / text steps fall through to the focused text field (default action not prevented)
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [picker])

    if (!picker || !event) return null

    const names = teams.map((t) => t.name)
    const shortcuts = teamShortcuts(names)
    const candidates = scorerCandidates(state, { teams, touch: coarse })
    const title = formatClock(event.matchTimeSec, clockLong)
    const { option } = state
    const canSkip = (state.step === 'team' && option.teamOptional) || (state.step === 'scorer' && option.personOptional) || state.step === 'assist'
    const personLabel = state.step === 'assist' ? 'Assist' : option.personLabel ?? 'Scorer'
    const textLabel = option.textLabel ?? 'Note'
    const textPlaceholder = option.askText === 'prompt' ? `${textLabel}? e.g. nutmeg on the wing` : `${textLabel} (optional)`
    const hint = state.step === 'type' ? 'Esc to finish · ⌫ cancel'
        : state.step === 'text' ? '⏎ save · Esc to finish'
        : canSkip ? 'Tab skip · Esc to finish' : 'Esc to finish'
    const prompt = state.step === 'type' ? 'What happened?' : state.step === 'team' ? 'Which team?' : state.step === 'scorer' || state.step === 'assist' ? personLabel : textLabel
    const highlightedId = state.highlighted >= 0 ? PICKER_OPTIONS[state.highlighted]?.id : undefined

    if (coarse) {
        const finishEarly = !(pending && state.step === 'type')
        const personSkip = state.step === 'assist' ? { label: 'None', run: () => dispatch({ kind: 'choose', value: SKIP }) }
            : state.step === 'scorer' ? { label: 'Skip', run: () => dispatch(option.personOptional ? { kind: 'choose', value: SKIP } : { kind: 'key', key: 'Escape' }) }
            : state.step === 'team' && option.teamOptional ? { label: 'Skip', run: () => dispatch({ kind: 'choose', value: SKIP }) }
            : null
        return inSlot(placement, slot, (
            <TagColumn
                label={picker.fresh || pending ? 'Tag event' : 'Edit event'}
                placement={placement === 'compact' ? 'compact' : 'column'}
                crumbs={breadcrumbs({ clock: title, option: state.step === 'type' ? undefined : option, team: state.team, scorer: event.scorer, step: state.step, scorerSkipped: state.step === 'assist' && !event.scorer })}
                step={state.step}
                question={questionFor(state.step, option)}
                teams={teams}
                candidates={candidates}
                added={added}
                query={state.query}
                textLabel={textLabel}
                textPlaceholder={textPlaceholder}
                warning={near && state.step === 'type' ? nearWarning(near) : undefined}
                personLabel={personLabel}
                isDisabled={(name) => isDisabledName(state, name)}
                skipLabel={personSkip?.label ?? 'Skip'}
                onSkip={personSkip?.run}
                onDone={finishEarly ? () => dispatch({ kind: 'key', key: 'Escape' }) : undefined}
                onCancel={cancel}
                onGoto={(step) => dispatch({ kind: 'goto', step })}
                onChoose={(value) => dispatch({ kind: 'choose', value })}
                onQuery={(value) => dispatch({ kind: 'text', value })}
                onTextDone={() => dispatch({ kind: 'key', key: 'Escape' })}
            />
        ))
    }

    const ui = (
        <div className={`event-picker event-picker--${placement}`} role="dialog" aria-label={picker.fresh || pending ? 'Tag event' : 'Edit event'}>
            <div className="event-picker__head">
                <div className="event-picker__title">{title}{state.team ? ` · ${state.team}` : ''}{event.scorer ? ` · ${event.scorer}` : ''}{assistOf(event) ? ` (assist ${assistOf(event)})` : ''}</div>
                {coarse && <div className="event-picker__prompt">{prompt}</div>}
            </div>
            <div className="event-picker__body">
            {near && state.step === 'type' && (
                <p role="alert" className="event-picker__warn">
                    You tagged {controlLabel(near.event)} {near.deltaSec === 0 ? 'at this same second' : `${Math.abs(near.deltaSec)} s ${near.deltaSec < 0 ? 'before' : 'after'} this`}.
                    {' '}{coarse ? 'Cancel' : <kbd>⌫</kbd>} if that was a double tap.
                </p>
            )}

            {state.step === 'type' && (coarse ? (
                <div role="listbox" aria-label="Event type" className="event-picker__groups">
                    {PICKER_GROUPS.map((g) => (
                        <div key={g.label} role="group" aria-label={g.label} className="event-picker__group">
                            <div className="event-picker__group-title" aria-hidden="true">{g.label}</div>
                            {g.ids.map((id) => {
                                const o = PICKER_OPTIONS.find((x) => x.id === id) as PickerOption
                                return (
                                    <div key={o.id} role="option" aria-selected={o.id === highlightedId} tabIndex={-1}
                                        className="event-picker__item event-picker__item--type" onClick={() => dispatch({ kind: 'choose', value: o.id })}>
                                        <EventTag event={{ type: o.type, pen: o.pen }}>{o.label}</EventTag>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            ) : (
                <ul role="listbox" className="event-picker__list">
                    {PICKER_OPTIONS.map((o, i) => (
                        <li key={o.id} role="option" aria-selected={i === state.highlighted}
                            className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: o.id })}>
                            <EventTag event={{ type: o.type, pen: o.pen }}>{o.label}</EventTag>{' '}
                            <kbd>{o.id === 'goal' ? '⏎ G' : o.key.toUpperCase()}</kbd>
                        </li>
                    ))}
                </ul>
            ))}

            {state.step === 'team' && (
                <ul role="listbox" className="event-picker__list event-picker__list--teams">
                    {names.map((n, i) => (
                        <li key={n} role="option" aria-selected={!coarse && i === state.highlighted}
                            className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: n })}>
                            {coarse && <span className="team-dot" style={{ background: teamBackground(teams[i].color) }} />}
                            <span className="voice-scoreboard">{n}</span>{' '}
                            {!coarse && <kbd>{shortcuts[i].toUpperCase()}</kbd>}
                        </li>
                    ))}
                </ul>
            )}

            {(state.step === 'scorer' || state.step === 'assist') && (
                <PersonStep
                    label={personLabel}
                    autoFocus={!coarse}
                    chips={coarse}
                    skipLabel={state.step === 'assist' ? 'No assist' : 'Skip'}
                    onSkip={canSkip ? () => dispatch({ kind: 'choose', value: SKIP }) : undefined}
                    placeholder={coarse ? `Type a new ${personLabel.toLowerCase()}` : state.step === 'assist' ? 'Assist (optional) — type to filter, Enter to pick, Tab to skip' : `${personLabel} — type to filter, Enter to pick`}
                    query={state.query}
                    candidates={candidates}
                    highlighted={state.highlighted}
                    showHighlight={!coarse}
                    onQuery={(value) => dispatch({ kind: 'text', value })}
                    onChoose={(value) => dispatch({ kind: 'choose', value })}
                    isDisabled={(name) => isDisabledName(state, name)}
                />
            )}

            {state.step === 'text' && (
                <div className="event-picker__text">
                    <input
                        autoFocus={!coarse}
                        aria-label={textLabel}
                        className="event-picker__input"
                        placeholder={textPlaceholder}
                        enterKeyHint="done"
                        maxLength={200}
                        value={state.query}
                        onChange={(e) => dispatch({ kind: 'text', value: e.target.value })}
                    />
                    {coarse && <button type="button" className="btn-primary" onClick={() => dispatch({ kind: 'key', key: 'Escape' })}>Done</button>}
                </div>
            )}

            {canSkip && !(coarse && (state.step === 'scorer' || state.step === 'assist')) && (
                <button type="button" className="event-picker__skip" onClick={() => dispatch({ kind: 'choose', value: SKIP })}>
                    Skip{!coarse && <kbd>Tab</kbd>}
                </button>
            )}
            </div>

            {coarse ? (
                <div className="event-picker__actions">
                    <button type="button" className="btn-quiet" onClick={cancel}>Cancel</button>
                    {!(pending && state.step === 'type') && state.step !== 'text' && (
                        <button type="button" className="btn-primary" onClick={() => dispatch({ kind: 'key', key: 'Escape' })}>Done</button>
                    )}
                </div>
            ) : (
                <div className="event-picker__hint">{hint}</div>
            )}
        </div>
    )
    return inSlot(placement, slot, ui)
}

/** Column panels render into the rail / stack slot (replacing the event list); everything else stays in the player. */
function inSlot(placement: string, slot: HTMLElement | null, ui: ReactNode): ReactNode {
    return placement === 'column' && slot ? createPortal(ui, slot) : ui
}
