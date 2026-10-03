import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import { PICKER_OPTIONS, eventIcon } from '../utils/eventTypes'
import { initialPickerState, pickerReducer, scorerCandidates, type PickerInput, type PickerState } from '../utils/eventPicker'
import { teamShortcuts } from '../utils/roster'
import { formatHMS } from '../utils/timeline'

const HANDLED = new Set(['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Backspace'])

export function EventPicker() {
    const picker = useAppState((s) => s.picker)
    const event = useAppState((s) => s.events.find((e) => e.id === s.picker?.eventId))
    const teams = useAppState((s) => s.teams)
    const [state, setState] = useState<PickerState>(initialPickerState)
    const stateRef = useRef(state)
    stateRef.current = state

    useEffect(() => { setState(initialPickerState) }, [picker?.eventId])

    const dispatch = (input: PickerInput): void => {
        const store = useAppState.getState()
        const id = store.picker?.eventId
        if (!id) return
        const { state: next, effects } = pickerReducer(stateRef.current, input, { teams: store.teams })
        stateRef.current = next
        setState(next)
        for (const fx of effects) {
            if (fx.kind === 'update') store.updateEvent(id, fx.patch)
            else if (fx.kind === 'remove') store.removeEvent(id)
            else if (fx.kind === 'addToRoster') store.addToRoster(fx.team, fx.name)
            else useAppState.getState().closePicker()
        }
    }

    useEffect(() => {
        if (!picker) return
        const onKey = (e: KeyboardEvent): void => {
            if (e.metaKey || e.ctrlKey || e.altKey) return
            e.stopImmediatePropagation()
            const inText = stateRef.current.step === 'scorer'
            const isLetter = e.key.length === 1
            if (HANDLED.has(e.key) && !(inText && e.key === 'Backspace')) {
                e.preventDefault()
                dispatch({ kind: 'key', key: e.key })
            } else if (isLetter && !inText) {
                e.preventDefault()
                dispatch({ kind: 'key', key: e.key })
            }
            // letters in the scorer step fall through to the focused text field (default action not prevented)
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [picker])

    if (!picker || !event) return null

    const names = teams.map((t) => t.name)
    const shortcuts = teamShortcuts(names)
    const candidates = scorerCandidates(state, { teams })
    const title = `${formatHMS(event.matchTimeSec)} ${eventIcon(event)}`

    return (
        <div className="event-picker" role="dialog" aria-label="Event details">
            <div className="event-picker__title">{title}{state.team ? ` · ${state.team}` : ''}</div>

            {state.step === 'type' && (
                <ul role="listbox" className="event-picker__list">
                    {PICKER_OPTIONS.map((o, i) => (
                        <li key={o.id} role="option" aria-selected={i === state.highlighted}
                            className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: o.id })}>
                            <span>{o.label}</span>{' '}
                            <kbd>{o.id === 'goal' ? '⏎ G' : o.key.toUpperCase()}</kbd>
                        </li>
                    ))}
                </ul>
            )}

            {state.step === 'team' && (
                <ul role="listbox" className="event-picker__list">
                    {names.map((n, i) => (
                        <li key={n} role="option" aria-selected={i === state.highlighted}
                            className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: n })}>
                            <span>{n}</span>{' '}
                            <kbd>{shortcuts[i].toUpperCase()}</kbd>
                        </li>
                    ))}
                </ul>
            )}

            {state.step === 'scorer' && (
                <div>
                    <input
                        autoFocus
                        aria-label="Scorer"
                        className="event-picker__input"
                        placeholder="Scorer — type to filter, Enter to pick"
                        value={state.query}
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
            <div className="event-picker__hint">Esc to finish{state.step === 'type' ? ' · ⌫ cancel' : ''}</div>
        </div>
    )
}
