import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAppState } from '../state'
import { nearbyMark } from '../utils/duplicates'
import { PICKER_GROUPS, PICKER_OPTIONS, controlLabel, eventIcon, EVENT_META, type PickerOption } from '../utils/eventTypes'
import { SKIP, initialPickerState, pickerReducer, touchPickerState, scorerCandidates, type PickerInput, type PickerState } from '../utils/eventPicker'
import { teamShortcuts } from '../utils/roster'
import { formatHMS } from '../utils/timeline'
import type { MatchEvent } from '../types'
import { panelPlacement, usePanelSlot } from './panelSlot'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

const HANDLED = new Set(['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Backspace', 'Tab'])

const startState = (pending: boolean): PickerState => (pending ? touchPickerState : initialPickerState)

export function EventPicker() {
    const picker = useAppState((s) => s.picker)
    const storedEvent = useAppState((s) => s.events.find((e) => e.id === s.picker?.eventId))
    const teams = useAppState((s) => s.teams)
    const events = useAppState((s) => s.events)
    const fullscreen = useAppState((s) => s.playerFullscreen || s.immersive)
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

    useEffect(() => { setState(startState(!!useAppState.getState().picker?.pending)) }, [picker?.eventId])

    const dispatch = (input: PickerInput): void => {
        const store = useAppState.getState()
        const current = store.picker
        if (!current) return
        const id = current.eventId
        const { state: next, effects } = pickerReducer(stateRef.current, input, { teams: store.teams })
        stateRef.current = next
        setState(next)
        // The first real choice creates the event (one undo step); closing without one creates nothing.
        if (current.pending && effects.some((fx) => fx.kind === 'update' || fx.kind === 'marker')) store.commitPending()
        for (const fx of effects) {
            if (fx.kind === 'update') store.updateEvent(id, fx.patch)
            else if (fx.kind === 'remove') { if (useAppState.getState().events.some((e) => e.id === id)) store.removeEvent(id) }
            else if (fx.kind === 'addToRoster') store.addToRoster(fx.team, fx.name)
            else if (fx.kind === 'marker') store.placeMarker(id, fx.type)
            else useAppState.getState().closePicker()
        }
    }

    const cancel = (): void => {
        const store = useAppState.getState()
        const id = store.picker?.eventId
        if (id && store.events.some((e) => e.id === id)) store.removeEvent(id)
        else store.closePicker()
    }

    // The scorer field takes focus and then unmounts; give focus back (normally the
    // video.js element, where its hotkeys listen) so G keeps working afterwards.
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
            const inText = step === 'scorer' || step === 'text'
            const isLetter = e.key.length === 1
            const caretKey = step === 'text' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')
            if (HANDLED.has(e.key) && !(inText && e.key === 'Backspace') && !caretKey) {
                e.preventDefault()
                dispatch({ kind: 'key', key: e.key })
            } else if (isLetter && !inText) {
                e.preventDefault()
                dispatch({ kind: 'key', key: e.key })
            }
            // letters in the scorer / text steps fall through to the focused text field (default action not prevented)
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [picker])

    if (!picker || !event) return null

    const names = teams.map((t) => t.name)
    const shortcuts = teamShortcuts(names)
    const candidates = scorerCandidates(state, { teams })
    const title = `${formatHMS(event.matchTimeSec)} ${eventIcon(event)}`
    const { option } = state
    const canSkip = (state.step === 'team' && option.teamOptional) || (state.step === 'scorer' && option.personOptional)
    const personLabel = option.personLabel ?? 'Scorer'
    const textLabel = option.textLabel ?? 'Note'
    const textPlaceholder = option.askText === 'prompt' ? `${textLabel}? e.g. nutmeg on the wing` : `${textLabel} (optional)`
    const hint = state.step === 'type' ? 'Esc to finish · ⌫ cancel'
        : state.step === 'text' ? '⏎ save · Esc to finish'
        : canSkip ? 'Tab skip · Esc to finish' : 'Esc to finish'
    const prompt = state.step === 'type' ? 'What happened?' : state.step === 'team' ? 'Which team?' : state.step === 'scorer' ? personLabel : textLabel
    const highlightedId = state.highlighted >= 0 ? PICKER_OPTIONS[state.highlighted]?.id : undefined

    const ui = (
        <div className={`event-picker event-picker--${placement}`} role="dialog" aria-label="Event details">
            <div className="event-picker__title">{title}{state.team ? ` · ${state.team}` : ''}{event.scorer ? ` · ${event.scorer}` : ''}</div>
            {coarse && <div className="event-picker__prompt">{prompt}</div>}
            <div className="event-picker__body">
            {near && state.step === 'type' && (
                <p role="alert" className="event-picker__warn">
                    {controlLabel(near.event)} already marked {near.deltaSec === 0 ? 'at this second' : `${Math.abs(near.deltaSec)} s ${near.deltaSec < 0 ? 'earlier' : 'later'}`}
                    {' · '}{coarse ? 'Cancel' : <kbd>⌫</kbd>} if this was a double tap
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
                                        <span className="event-picker__icon" aria-hidden="true">{EVENT_META[o.type].icon}</span>
                                        <span>{o.label}</span>
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
                            <span>{o.label}</span>{' '}
                            <kbd>{o.id === 'goal' ? '⏎ G' : o.key.toUpperCase()}</kbd>
                        </li>
                    ))}
                </ul>
            ))}

            {state.step === 'team' && (
                <ul role="listbox" className="event-picker__list event-picker__list--teams">
                    {names.map((n, i) => (
                        <li key={n} role="option" aria-selected={i === state.highlighted}
                            className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: n })}>
                            {coarse && <span className="team-dot" style={{ background: teams[i].color }} />}
                            <span>{n}</span>{' '}
                            {!coarse && <kbd>{shortcuts[i].toUpperCase()}</kbd>}
                        </li>
                    ))}
                </ul>
            )}

            {state.step === 'scorer' && (
                <div className="event-picker__person">
                    <input
                        autoFocus={!coarse}
                        aria-label={personLabel}
                        className="event-picker__input"
                        placeholder={coarse ? `Search or type ${personLabel.toLowerCase()}` : `${personLabel} — type to filter, Enter to pick`}
                        value={state.query}
                        enterKeyHint="done"
                        autoComplete="off"
                        onChange={(e) => dispatch({ kind: 'text', value: e.target.value })}
                    />
                    <ul role="listbox" className="event-picker__list">
                        {candidates.map((n, i) => (
                            <li key={n} role="option" aria-selected={i === state.highlighted}
                                className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: n })}>
                                <span>{n}</span>
                            </li>
                        ))}
                        {state.query.trim() && candidates.length === 0 && (
                            <li role="option" aria-selected className="event-picker__item"
                                onClick={() => dispatch({ kind: 'choose', value: state.query.trim() })}>
                                <span>+ add “{state.query.trim()}”</span>
                            </li>
                        )}
                    </ul>
                </div>
            )}

            {state.step === 'text' && (
                <input
                    autoFocus
                    aria-label={textLabel}
                    className="event-picker__input"
                    placeholder={textPlaceholder}
                    enterKeyHint="done"
                    maxLength={200}
                    value={state.query}
                    onChange={(e) => dispatch({ kind: 'text', value: e.target.value })}
                />
            )}

            {canSkip && (
                <button type="button" className="event-picker__skip" onClick={() => dispatch({ kind: 'choose', value: SKIP })}>
                    Skip{!coarse && <kbd>Tab</kbd>}
                </button>
            )}
            </div>

            {coarse ? (
                <div className="event-picker__actions">
                    <button type="button" className="btn-quiet" onClick={cancel}>Cancel</button>
                    {!(pending && state.step === 'type') && (
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
