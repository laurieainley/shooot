import { useState, type KeyboardEvent } from 'react'

interface PersonStepProps {
    /** Accessible name of the field: "Scorer", "Assist", "Own goal by"… */
    label: string
    placeholder: string
    query: string
    /** Roster names matching the query. */
    candidates: string[]
    highlighted: number
    /** Show the highlighted row (not on touch, where nothing is preselected). */
    showHighlight: boolean
    autoFocus: boolean
    onQuery: (value: string) => void
    /** A roster name, or a new typed name ("+ add …"). */
    onChoose: (name: string) => void
    /** Rows shown but not selectable (the scorer in the assist list: dimmed, in place, so the other names do not shift). */
    isDisabled?: (name: string) => boolean
    /** Only for hosts that handle keys on the field itself (the event picker listens on the window instead). */
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
    /** Touch: tappable name chips instead of a typed field (the field opens only for "+ New name"). */
    chips?: boolean
    /** Chips only: the skip button ("Skip", "No assist"); without `onSkip` there is none. */
    skipLabel?: string
    onSkip?: () => void
    /** Chips only: show the step's name ("Scorer", "Assist") above the chips, for hosts with no header of their own. */
    showLabel?: boolean
}

/** The optional person step shared by the event picker and the review card: a field that filters the team roster, plus the matching names. */
export function PersonStep(props: PersonStepProps) {
    return props.chips ? <PersonChips {...props} /> : <PersonTyped {...props} />
}

/** Touch: the team's roster as chips (44 px targets), + New name for a typed one, and a skip button. */
function PersonChips({ label, placeholder, query, candidates, onQuery, onChoose, isDisabled, onKeyDown, skipLabel = 'Skip', onSkip, showLabel }: PersonStepProps) {
    const [typing, setTyping] = useState(false)
    const names = [...candidates].sort((a, b) => a.localeCompare(b))
    const typed = query.trim()
    return (
        <div className="person-chips">
            {showLabel && <p className="person-chips__label" aria-hidden="true">{label}</p>}
            <div className="person-chips__list" role="group" aria-label={label}>
                {names.map((n) => (
                    <button key={n} type="button" className="person-chip" disabled={isDisabled?.(n) ?? false} onClick={() => onChoose(n)}>{n}</button>
                ))}
                {!typing && <button type="button" className="person-chip person-chip--new" onClick={() => setTyping(true)}>+ New name</button>}
                {onSkip && <button type="button" className="person-chip person-chip--skip" onClick={onSkip}>{skipLabel}</button>}
            </div>
            {typing && (
                <div className="person-chips__new">
                    <input autoFocus aria-label={label} className="event-picker__input" placeholder={placeholder} value={query} enterKeyHint="done" autoComplete="off"
                        onChange={(e) => onQuery(e.target.value)} onKeyDown={onKeyDown} />
                    <button type="button" className="btn-primary person-chips__add" disabled={!typed} onClick={() => onChoose(typed)}>Add</button>
                </div>
            )}
        </div>
    )
}

function PersonTyped({ label, placeholder, query, candidates, highlighted, showHighlight, autoFocus, onQuery, onChoose, isDisabled, onKeyDown }: PersonStepProps) {
    return (
        <div className="event-picker__person">
            <input
                autoFocus={autoFocus}
                aria-label={label}
                className="event-picker__input"
                placeholder={placeholder}
                value={query}
                enterKeyHint="done"
                autoComplete="off"
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={onKeyDown}
            />
            <ul role="listbox" className="event-picker__list">
                {candidates.map((n, i) => {
                    const off = isDisabled?.(n) ?? false
                    return (
                        <li key={n} role="option" aria-selected={!off && showHighlight && i === highlighted} aria-disabled={off || undefined}
                            className={`event-picker__item${off ? ' event-picker__item--disabled' : ''}`} onClick={off ? undefined : () => onChoose(n)}>
                            <span className="voice-shirt event-picker__person-name">{n}</span>
                        </li>
                    )
                })}
                {query.trim() && candidates.length === 0 && (
                    <li role="option" aria-selected={showHighlight} className="event-picker__item"
                        onClick={() => onChoose(query.trim())}>
                        <span>+ add “{query.trim()}”</span>
                    </li>
                )}
            </ul>
        </div>
    )
}
