import { teamBackground } from '../utils/teamColor'
import { useEffect, useMemo, useRef, useState } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { MarkerType, MatchEvent, Team } from '../types'
import { optionForEvent, personEdit, typeChangePatch } from '../utils/eventEdit'
import { PICKER_OPTIONS, isMarker } from '../utils/eventTypes'
import { watchFromSec } from '../utils/markers'
import { wantsReplay } from '../utils/replays'
import { filterRoster, rosterTeamFor } from '../utils/roster'
import { formatEventClock } from '../utils/timeline'
import { ColumnPanel } from './ColumnPanel'
import { ReplayFraming } from './ReplayFraming'

/**
 * Touch editing of an existing event (tap a row in the event log; it replaces the events column rather than covering the picture): type, team, person, note, time nudge,
 * replay, delete. Every change is applied at once (one undo step each); typed text is saved on Enter, when
 * the field loses focus and when the sheet closes. Desktop keeps inline editing in the log.
 */
export function EventSheet() {
    const event = useAppState((s) => s.events.find((e) => e.id === s.editingEventId))
    const teams = useAppState((s) => s.teams)
    if (!event) return null
    return <EventSheetBody key={event.id} event={event} teams={teams} />
}

interface EventSheetBodyProps {
    event: MatchEvent
    teams: Team[]
}

function EventSheetBody({ event: e, teams }: EventSheetBodyProps) {
    const offset = useAppState((s) => s.cumulativeOffsets[e.sourceFileIndex ?? 0] ?? 0)
    const matchStartSec = useAppState(selectMatchStartSec)
    const clockLong = useAppState(selectClockLong)
    const multiFile = useAppState((s) => s.files.length > 1)
    const option = optionForEvent(e)
    const marker = isMarker(e)
    const [person, setPerson] = useState(e.scorer ?? '')
    const [note, setNote] = useState(e.notes ?? '')
    // Drafts follow the event when it changes underneath (a type without a person clears it, undo…).
    useEffect(() => setPerson(e.scorer ?? ''), [e.scorer])
    useEffect(() => setNote(e.notes ?? ''), [e.notes])
    const latest = useRef({ person, note })
    latest.current = { person, note }

    const update = (patch: Partial<MatchEvent>): void => useAppState.getState().updateEvent(e.id, patch)
    // Read the event from the store: a blur can land after Delete or another change.
    const current = (): MatchEvent | undefined => useAppState.getState().events.find((x) => x.id === e.id)
    const savePerson = (name: string): void => {
        const cur = current()
        if (!cur || name.trim() === (cur.scorer ?? '')) return
        const { patch, addToRoster } = personEdit(useAppState.getState().teams, cur, name)
        if (addToRoster) useAppState.getState().addToRoster(addToRoster.team, addToRoster.name)
        useAppState.getState().updateEvent(cur.id, patch)
    }
    const saveNote = (text: string): void => {
        const cur = current()
        const clean = text.trim()
        if (cur && clean !== (cur.notes ?? '')) useAppState.getState().updateEvent(cur.id, { notes: clean || undefined })
    }
    const close = (): void => {
        const { person: p, note: n } = latest.current
        if (option.askScorer) savePerson(p)
        if (!marker) saveNote(n)
        useAppState.getState().closePanel()
    }
    const watch = (): void => {
        close()
        const st = useAppState.getState()
        if (!e.unlinked) st.seekToGoal(e.sourceFileIndex ?? 0, watchFromSec(e, st.lengthBeforeGoalSec))
    }
    const nudge = (d: number): void => {
        update({ matchTimeSec: Math.max(0, e.matchTimeSec + d) })
        useAppState.getState().sortEvents()
    }

    const hasTeams = teams.length >= 2 && teams.every((t) => t.name.trim() !== '')
    const roster = rosterTeamFor(teams, e.team, e.type)
    const pool = useMemo(() => roster?.roster ?? teams.flatMap((t) => t.roster), [roster, teams])
    const suggestions = person.trim() && person.trim() !== e.scorer ? filterRoster(pool, person) : pool
    const personLabel = option.personLabel ?? 'Scorer'
    const clock = formatEventClock(offset + e.matchTimeSec, e.matchTimeSec, matchStartSec, clockLong)

    return (
        <ColumnPanel label="Edit event" onClose={close} className="event-sheet">
            <p className="event-sheet__when">
                <span className="tc">{clock}</span>
                {multiFile && <span className="tag">V{(e.sourceFileIndex ?? 0) + 1}</span>}
                <span className="event-sheet__nudge">
                    <button type="button" className="btn-quiet" aria-label="1 second earlier" onClick={() => nudge(-1)}>−1 s</button>
                    <button type="button" className="btn-quiet" aria-label="1 second later" onClick={() => nudge(1)}>+1 s</button>
                </span>
            </p>

            <fieldset className="event-sheet__group">
                <legend>Type</legend>
                <div className="chips">
                    {PICKER_OPTIONS.map((o) => (
                        <button key={o.id} type="button" className="chip" aria-pressed={o.id === option.id}
                            onClick={() => {
                                if (o.id === option.id) return
                                // Kick off / Final whistle: single instance, so the store moves an existing one.
                                if (o.marker) useAppState.getState().placeMarker(e.id, o.type as MarkerType)
                                else update(typeChangePatch(e, o))
                            }}>{o.label}</button>
                    ))}
                </div>
            </fieldset>

            {hasTeams && !marker && (
                <fieldset className="event-sheet__group">
                    <legend>Team</legend>
                    <div className="chips">
                        {teams.map((t) => (
                            <button key={t.name} type="button" className="chip" aria-pressed={e.team === t.name}
                                onClick={() => { if (e.team !== t.name) update({ team: t.name }) }}>
                                <span className="team-dot" style={{ background: teamBackground(t.color) }} />{t.name}
                            </button>
                        ))}
                        <button type="button" className="chip" aria-label="No team" aria-pressed={!e.team}
                            onClick={() => { if (e.team) update({ team: undefined }) }}>None</button>
                    </div>
                </fieldset>
            )}

            {option.askScorer && (
                <fieldset className="event-sheet__group">
                    <legend>{personLabel}</legend>
                    <input
                        aria-label={personLabel}
                        className="field event-sheet__input"
                        value={person}
                        placeholder={option.personOptional ? `${personLabel} (optional)` : personLabel}
                        enterKeyHint="done"
                        autoComplete="off"
                        onChange={(ev) => setPerson(ev.target.value)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); savePerson(person); ev.currentTarget.blur() } }}
                        onBlur={() => savePerson(latest.current.person)}
                    />
                    {suggestions.length > 0 && (
                        <div className="chips">
                            {suggestions.map((n) => (
                                <button key={n} type="button" className="chip" aria-pressed={e.scorer === n}
                                    onMouseDown={(ev) => ev.preventDefault()}
                                    onClick={() => { setPerson(n); savePerson(n) }}>{n}</button>
                            ))}
                        </div>
                    )}
                </fieldset>
            )}

            {!marker && <>
            <fieldset className="event-sheet__group">
                <legend>{option.textLabel ?? 'Note'}</legend>
                <input
                    aria-label="Note"
                    className="field event-sheet__input"
                    value={note}
                    maxLength={200}
                    placeholder={option.askText === 'prompt' ? 'e.g. nutmeg on the wing' : 'Optional'}
                    enterKeyHint="done"
                    onChange={(ev) => setNote(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); saveNote(note); ev.currentTarget.blur() } }}
                    onBlur={() => saveNote(latest.current.note)}
                />
            </fieldset>

            <label className="toggle-row">
                <input type="checkbox" checked={wantsReplay(e)} onChange={(ev) => update({ replay: ev.target.checked })} />
                <span className="toggle-row__text">Slow-mo replay<span className="toggle-row__hint">after the clip in the reel</span></span>
            </label>
            {wantsReplay(e) && <ReplayFraming event={e} />}
            </>}

            <div className="sheet__actions">
                <button type="button" className="btn-quiet btn-danger" onClick={() => { useAppState.getState().removeEvent(e.id); useAppState.getState().closePanel() }}>Delete</button>
                <span className="flex-1" />
                {!e.unlinked && <button type="button" className="btn-quiet" onClick={watch}>Watch</button>}
                <button type="button" className="btn-primary" onClick={close}>Done</button>
            </div>
        </ColumnPanel>
    )
}
