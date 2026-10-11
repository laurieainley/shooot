import type { KeyboardEvent } from 'react'

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
    /** Only for hosts that handle keys on the field itself (the event picker listens on the window instead). */
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}

/** The optional person step shared by the event picker and the review card: a field that filters the team roster, plus the matching names. */
export function PersonStep({ label, placeholder, query, candidates, highlighted, showHighlight, autoFocus, onQuery, onChoose, onKeyDown }: PersonStepProps) {
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
                {candidates.map((n, i) => (
                    <li key={n} role="option" aria-selected={showHighlight && i === highlighted}
                        className="event-picker__item" onClick={() => onChoose(n)}>
                        <span className="voice-shirt event-picker__person-name">{n}</span>
                    </li>
                ))}
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
