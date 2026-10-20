import { useEffect, useState } from 'react'
import type { Team } from '../types'
import { PICKER_OPTIONS, controlLabel, type PickerOption, type PickerOptionId } from '../utils/eventTypes'
import type { PickerStep } from '../utils/eventPicker'
import type { Crumb } from '../utils/tagFlow'
import { teamBackground } from '../utils/teamColor'
import { EventTag } from './EventTag'
import { PersonStep } from './PersonStep'

/** The first page of "What happened?": a two-column grid; the rest sit behind More…. */
const MAIN_IDS: PickerOptionId[] = ['goal', 'goal_pen', 'own_goal', 'save', 'foul', 'highlight']
const MORE_IDS: PickerOptionId[] = ['penalty_conceded', 'penalty_missed', 'kick_off', 'half_time', 'final_whistle']
const optionById = (id: PickerOptionId): PickerOption => PICKER_OPTIONS.find((o) => o.id === id) as PickerOption

interface TagColumnProps {
    /** Dialog name: "Tag event" or "Edit event". */
    label: string
    placement: 'column' | 'compact'
    crumbs: Crumb[]
    step: PickerStep
    question: string
    teams: Team[]
    /** The person step's roster names, already filtered by the typed text. */
    candidates: string[]
    /** Names added during this tag, shown after the A–Z names. */
    added: string[]
    query: string
    textLabel: string
    textPlaceholder: string
    /** A recent tag close to this time (a double tap): "You tagged … Cancel if that was a double tap." */
    warning?: string
    personLabel: string
    /** Disabled in the person list (the scorer on Assist). */
    isDisabled: (name: string) => boolean
    skipLabel: string
    onSkip?: () => void
    /** Finishing early keeps what has been answered. Absent while nothing has been chosen yet. */
    onDone?: () => void
    onCancel: () => void
    onGoto: (step: 'type' | 'team' | 'scorer') => void
    onChoose: (value: string) => void
    onQuery: (value: string) => void
    /** The text step's own Done. */
    onTextDone: () => void
}

/**
 * The Tag column on touch (spec 2026-10-20-unified-tag-review-design.md): breadcrumbs of what has been answered (tap one to
 * change it), one question at a time, choices anchored to the bottom next to the thumb. A right-hand column over the picture
 * (landscape, `compact`) or the panel under the picture (portrait, `column`).
 */
export function TagColumn(p: TagColumnProps) {
    const [more, setMore] = useState(false)
    useEffect(() => { setMore(false) }, [p.step])
    const ids = p.step === 'type' ? (more ? MORE_IDS : MAIN_IDS) : []
    return (
        <div className={`event-picker tagcol tagcol--${p.placement}`} role="dialog" aria-label={p.label}>
            <div className="tagcol__head">
                <ol className="tagcol__crumbs" aria-label="Tag so far">
                    {p.crumbs.map((c, i) => (
                        <li key={`${i}-${c.label}`}>
                            {c.step === null
                                ? <span className="tagcol__crumb tagcol__crumb--time tc">{c.label}</span>
                                : <button type="button" className="tagcol__crumb" aria-label={`Change ${c.label}`} onClick={() => p.onGoto(c.step as 'type' | 'team' | 'scorer')}>{c.label}</button>}
                        </li>
                    ))}
                </ol>
                {p.onDone && p.step !== 'text' && <button type="button" className="tagcol__done" onClick={p.onDone}>Done</button>}
                <button type="button" className="tagcol__x" aria-label="Cancel" onClick={p.onCancel}>
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </button>
            </div>
            <p className="tagcol__q" id="tagcol-q">{p.step === 'type' && more ? 'More' : p.question}</p>
            <div className="tagcol__body">
                {p.warning && <p role="alert" className="tagcol__warn">{p.warning}</p>}
                {p.step === 'type' && (
                    <>
                        <div role="listbox" aria-label="Event type" className="tagcol__grid">
                            {ids.map((id) => {
                                const o = optionById(id)
                                return (
                                    <div key={o.id} role="option" aria-selected={false} tabIndex={-1} className={`tagcol__choice${o.type === 'goal' ? ' tagcol__choice--goal' : ''}`}
                                        onClick={() => p.onChoose(o.id)}>
                                        <EventTag event={{ type: o.type, pen: o.pen }}>{o.label}</EventTag>
                                    </div>
                                )
                            })}
                            <button type="button" className="tagcol__choice tagcol__choice--quiet" aria-expanded={more} onClick={() => setMore(!more)}>{more ? '‹ Back' : 'More…'}</button>
                        </div>
                        {!more && <p className="tagcol__hint">Use ‹ › by the picture to fine-tune the moment.</p>}
                    </>
                )}
                {p.step === 'team' && (
                    <div role="listbox" aria-label="Team" className="tagcol__teams">
                        {p.teams.map((t) => (
                            <div key={t.name} role="option" aria-selected={false} tabIndex={-1} className="tagcol__choice tagcol__choice--team" onClick={() => p.onChoose(t.name)}>
                                <span className="team-dot" style={{ background: teamBackground(t.color) }} />
                                <span className="voice-scoreboard">{t.name}</span>
                            </div>
                        ))}
                        {p.onSkip && <button type="button" className="tagcol__choice tagcol__choice--quiet" onClick={p.onSkip}>{p.skipLabel}</button>}
                    </div>
                )}
                {(p.step === 'scorer' || p.step === 'assist') && (
                    <PersonStep
                        label={p.personLabel}
                        autoFocus={false}
                        chips
                        skipLabel={p.skipLabel}
                        onSkip={p.onSkip}
                        placeholder={`Type a new ${p.personLabel.toLowerCase()}`}
                        query={p.query}
                        candidates={p.candidates}
                        appended={p.added}
                        highlighted={-1}
                        showHighlight={false}
                        onQuery={p.onQuery}
                        onChoose={p.onChoose}
                        isDisabled={p.isDisabled}
                    />
                )}
                {p.step === 'text' && (
                    <div className="tagcol__text">
                        <input aria-label={p.textLabel} className="event-picker__input" placeholder={p.textPlaceholder} enterKeyHint="done" maxLength={200}
                            value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
                        <button type="button" className="btn-primary" onClick={p.onTextDone}>Done</button>
                    </div>
                )}
            </div>
        </div>
    )
}

/** Plain text for the duplicate-mark warning. */
export function nearWarning(near: { event: Parameters<typeof controlLabel>[0]; deltaSec: number }): string {
    const when = near.deltaSec === 0 ? 'at this same second' : `${Math.abs(near.deltaSec)} s ${near.deltaSec < 0 ? 'before' : 'after'} this`
    return `You tagged ${controlLabel(near.event)} ${when}. Cancel if that was a double tap.`
}
