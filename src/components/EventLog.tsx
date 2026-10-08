import { teamBackground } from '../utils/teamColor'
import { shouldHandleShortcut } from '../utils/shortcuts'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { MatchEvent, Team } from '../types'
import { emptyLogLine } from '../utils/voice'
import { controlLabel, isMarker } from '../utils/eventTypes'
import { eventRowParts } from '../utils/eventRow'
import { EventIcon } from './icons/EventIcon'
import { watchFromSec } from '../utils/markers'
import { wantsReplay } from '../utils/replays'
import { filterRoster, rosterTeamFor } from '../utils/roster'
import { formatScore, scoresAfter } from '../utils/score'
import { clockWidthCh, formatEventClock } from '../utils/timeline'
import { TimeInput } from './TimeInput'
import { RelinkBanner } from './RelinkBanner'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

type Field = 'scorer' | 'team' | 'time' | 'notes'
type Editing = { id: string; field: Field } | null

function isTyping(el: Element | null): boolean {
    return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

export function EventLog() {
    const events = useAppState((s) => s.events)
    const files = useAppState((s) => s.files)
    const teams = useAppState((s) => s.teams)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartTimeSec = useAppState(selectMatchStartSec)
    const clockLong = useAppState(selectClockLong)
    const canUndo = useAppState((s) => s.undoStack.length > 0)
    const canRedo = useAppState((s) => s.redoStack.length > 0)
    const coarse = useMediaQuery(COARSE_QUERY)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [editing, setEditing] = useState<Editing>(null)
    const rootRef = useRef<HTMLElement | null>(null)
    const listRef = useRef<HTMLOListElement | null>(null)

    const empty = emptyLogLine(coarse, files.length === 0)
    const selectedIndex = events.findIndex((e) => e.id === selectedId)
    const scores = useMemo(() => scoresAfter(events, teams, offsets), [events, teams, offsets])

    // A freshly marked event (picker open on it, once it exists) becomes the selection, so the log shows where it landed.
    const pickerEventId = useAppState((s) => (s.picker?.pending ? undefined : s.picker?.eventId))
    useEffect(() => { if (pickerEventId) setSelectedId(pickerEventId) }, [pickerEventId])

    // Global L focuses the log (never while typing or while the event picker is open).
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key !== 'l' && e.key !== 'L') return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            const st = useAppState.getState()
            if (!shouldHandleShortcut(e.target, { modalOpen: !!(st.picker || st.panel) })) return
            if (rootRef.current?.contains(document.activeElement)) return
            e.preventDefault()
            rootRef.current?.focus()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    useEffect(() => {
        if (!selectedId) return
        const el = listRef.current?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedId)}"]`)
        el?.scrollIntoView?.({ block: 'nearest' })
    }, [selectedId])

    // Watch = seek to the clip start and play. Selecting a row never moves or starts the video.
    const watch = (e: MatchEvent): void => {
        if (e.unlinked) return
        const st = useAppState.getState()
        st.seekToGoal(e.sourceFileIndex ?? 0, watchFromSec(e, st.lengthBeforeGoalSec))
    }
    const toggleReplay = (e: MatchEvent): void => { if (!isMarker(e)) useAppState.getState().updateEvent(e.id, { replay: !wantsReplay(e) }) }
    const remove = (index: number): void => {
        const e = events[index]
        if (!e) return
        const next = events[index + 1] ?? events[index - 1]
        useAppState.getState().removeEvent(e.id)
        setSelectedId(next?.id ?? null)
    }

    const onKeyDown = (ev: ReactKeyboardEvent<HTMLElement>): void => {
        if (isTyping(ev.target as Element) || ev.metaKey || ev.ctrlKey || ev.altKey) return
        const sel = events[selectedIndex]
        const move = (d: number): void => {
            if (events.length === 0) return
            const i = selectedIndex === -1 ? (d > 0 ? 0 : events.length - 1) : Math.max(0, Math.min(events.length - 1, selectedIndex + d))
            setSelectedId(events[i].id)
        }
        let handled = true
        switch (ev.key) {
            case 'ArrowDown': move(1); break
            case 'ArrowUp': move(-1); break
            case 'Home': if (events[0]) setSelectedId(events[0].id); break
            case 'End': if (events.length) setSelectedId(events[events.length - 1].id); break
            case 'Enter': if (sel) watch(sel); break
            case 'Delete': case 'Backspace': remove(selectedIndex); break
            case 'r': case 'R': if (sel) toggleReplay(sel); break
            case 'e': case 'E': if (sel) setEditing({ id: sel.id, field: 'scorer' }); break
            case 't': case 'T': if (sel) setEditing({ id: sel.id, field: 'team' }); break
            case 'n': case 'N': if (sel) setEditing({ id: sel.id, field: 'notes' }); break
            case 'g': case 'G': { const st = useAppState.getState(); st.markEvent(st.currentTimeInFileSec); break }
            case 'Escape': rootRef.current?.blur(); break
            default: handled = false
        }
        if (handled) { ev.preventDefault(); ev.stopPropagation() }
    }

    return (
        <section
            ref={rootRef}
            aria-label="Events"
            tabIndex={0}
            onKeyDown={onKeyDown}
            title="L to focus · ↑↓ select · ⏎ watch · R replay · E person · T team · N note · ⌫ delete · Esc back to video"
            className="event-log group/log flex min-h-0 flex-col outline-none"
        >
            <header className="flex items-center gap-1 border-b border-line px-3 py-2">
                <h2 className="m-0 mr-auto voice-heading text-[15px]">
                    Events <span className="tc text-[13px] font-normal tracking-normal text-muted">· {events.length}</span>
                </h2>
                {!coarse && (
                    <button type="button" onClick={() => { const st = useAppState.getState(); st.markEvent(st.currentTimeInFileSec) }}
                        disabled={files.length === 0}
                        className="btn-primary mark-btn">+ Event</button>
                )}
                <button type="button" aria-label="Undo" title="Undo (⌘Z)" onClick={() => useAppState.getState().undo()} disabled={!canUndo} className="btn-icon"><UndoIcon /></button>
                <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" onClick={() => useAppState.getState().redo()} disabled={!canRedo} className="btn-icon"><UndoIcon redo /></button>
            </header>
            <RelinkBanner />

            {events.length === 0 ? (
                <p className="empty-log m-0 px-3 py-4 text-[13px] text-muted">
                    <strong className="empty-log__lead voice-heading">{empty.lead}</strong>
                    {' '}{empty.key ? <>{empty.hint} <kbd>{empty.key}</kbd> {empty.tail}</> : empty.hint}
                </p>
            ) : (
                <ol ref={listRef} role="listbox" aria-label="Event list" className="m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-0"
                    style={{ '--clock-ch': clockWidthCh(clockLong, true) } as CSSProperties}>
                    {events.map((e) => (
                        <EventRow
                            key={e.id}
                            event={e}
                            teams={teams}
                            selected={e.id === selectedId}
                            clock={formatEventClock((offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec, e.matchTimeSec, matchStartTimeSec, clockLong)}
                            score={scores.get(e.id)}
                            fileTag={files.length > 1 ? `V${(e.sourceFileIndex ?? 0) + 1}` : null}
                            fileSlot={files.length > 1}
                            editing={editing?.id === e.id ? editing.field : null}
                            onSelect={() => {
                                setSelectedId(e.id)
                                // Touch: no double-click or keys, so a tap opens the editor (desktop edits inline).
                                if (coarse) useAppState.getState().editEvent(e.id)
                            }}
                            onWatch={() => { setSelectedId(e.id); watch(e) }}
                            onEdit={(field) => { setSelectedId(e.id); setEditing(field ? { id: e.id, field } : null) }}
                            onToggleReplay={() => toggleReplay(e)}
                            onFraming={() => useAppState.getState().editEvent(e.id)}
                            onRemove={() => remove(events.indexOf(e))}
                            restoreFocus={() => rootRef.current?.focus()}
                            touch={coarse}
                        />
                    ))}
                </ol>
            )}
        </section>
    )
}

interface EventRowProps {
    event: MatchEvent
    teams: Team[]
    selected: boolean
    clock: string
    score?: [number, number]
    fileTag: string | null
    /** More than one file: every row keeps a badge column so rows line up. */
    fileSlot: boolean
    editing: Field | null
    onSelect: () => void
    onWatch: () => void
    onEdit: (field: Field | null) => void
    onToggleReplay: () => void
    onFraming: () => void
    onRemove: () => void
    restoreFocus: () => void
    /** Touch: delete lives in the edit sheet (a tap opens it), so the row keeps only the replay toggle. */
    touch?: boolean
}

function EventRow({ event: e, teams, selected, clock, score, fileTag, fileSlot, editing, onSelect, onWatch, onEdit, onToggleReplay, onFraming, onRemove, restoreFocus, touch = false }: EventRowProps) {
    const team = teams.find((t) => t.name === e.team)
    const replay = wantsReplay(e)
    const parts = eventRowParts(e)
    const title = `${parts.title}${e.team ? ` – ${e.team}` : ''}`
    const stop = (ev: React.SyntheticEvent): void => ev.stopPropagation()
    const done = (): void => { onEdit(null); restoreFocus() }
    const update = useAppState((s) => s.updateEvent)

    if (isMarker(e)) return <MarkerRow event={e} selected={selected} clock={clock} fileTag={fileTag} fileSlot={fileSlot} editing={editing} onSelect={onSelect} onWatch={onWatch} onEdit={onEdit} onRemove={onRemove} restoreFocus={restoreFocus} touch={touch} />

    return (
        <li
            role="option"
            aria-selected={selected}
            aria-disabled={e.unlinked ? true : undefined}
            data-event-id={e.id}
            onClick={onSelect}
            className="event-row"
        >
            {editing === 'time' ? (
                <span onClick={stop}>
                    <TimeInput
                        ariaLabel="Event time"
                        valueSec={e.matchTimeSec}
                        onCommit={(t) => {
                            update(e.id, { matchTimeSec: t })
                            useAppState.getState().sortEvents()
                            done()
                        }}
                        className="field tc w-full px-1 py-0 text-[13px]"
                    />
                </span>
            ) : (
                <span className="tc clock text-[13px]" onDoubleClick={(ev) => { stop(ev); onEdit('time') }} title="Double-click to edit time (in file)">{clock}</span>
            )}

            <span
                data-team-dot
                className="team-dot"
                style={{ background: teamBackground(team?.color) }}
                title={e.team ? `${e.team} · double-click to change` : 'No team · double-click to set'}
                onDoubleClick={(ev) => { stop(ev); onEdit('team') }}
            />

            <span className="event-row__icon"><EventIcon event={e} size={touch ? 22 : 18} /></span>

            {editing === 'team' ? (
                <span className="flex min-w-0 gap-1" onClick={stop}>
                    {teams.map((t) => (
                        <button key={t.name} type="button" autoFocus={t.name === e.team || (!e.team && t === teams[0])}
                            onClick={() => { update(e.id, { team: t.name }); done() }}
                            onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done() } }}
                            className="btn-quiet flex items-center gap-1 px-1.5 py-0 text-[12px]">
                            <span className="team-dot" style={{ background: teamBackground(t.color) }} />{t.name}
                        </button>
                    ))}
                </span>
            ) : editing === 'scorer' ? (
                <ScorerEdit event={e} teams={teams} onDone={done} />
            ) : editing === 'notes' ? (
                <NoteEdit event={e} onDone={done} />
            ) : (
                <span className="event-row__content" title={title}>
                    <span className="event-row__main" onDoubleClick={(ev) => { stop(ev); onEdit('scorer') }}>
                        {parts.person
                            ? <span className="ev-person voice-shirt">{parts.person}</span>
                            : <span className="event-row__type">{controlLabel(e)}</span>}
                    </span>
                    {parts.sub.length > 0 && (
                        <span className="event-row__sub">
                            {parts.sub.map((part) => part.startsWith('—')
                                ? <span key={part} className="event-row__note" onDoubleClick={(ev) => { stop(ev); onEdit('notes') }}>{part}</span>
                                : <span key={part} className="event-row__assist">{part}</span>)}
                        </span>
                    )}
                </span>
            )}

            <span className="event-row__end">
                <span {...(score ? { 'data-score': '' } : {})} className="tc row-score" title={score ? 'Score after this goal' : undefined}>{score ? formatScore(score) : null}</span>
                <FileSlot unlinked={e.unlinked} fileKey={e.sourceFileKey} fileTag={fileTag} show={fileSlot} />
                <WatchButton onWatch={onWatch} disabled={e.unlinked} />
                <button type="button" aria-label="Replay" aria-pressed={replay} title={replay ? 'Slow-mo replay on (R)' : 'Slow-mo replay off (R)'}
                    tabIndex={-1} onClick={(ev) => { stop(ev); onToggleReplay() }} className="row-btn replay-btn">↻</button>
                {!touch && (replay ? (
                    <button type="button" aria-label="Replay framing" title="Replay framing (zoom to the goal)" tabIndex={-1}
                        onClick={(ev) => { stop(ev); onFraming() }} className="row-btn framing-btn">⌖</button>
                ) : <span className="row-btn row-btn--gap" aria-hidden="true" />)}
                {!touch && (
                    <button type="button" aria-label="Delete event" title="Delete (⌫)" tabIndex={-1}
                        onClick={(ev) => { stop(ev); onRemove() }} className="row-btn delete-btn">×</button>
                )}
            </span>
        </li>
    )
}

type MarkerRowProps = Pick<EventRowProps, 'event' | 'selected' | 'clock' | 'fileTag' | 'fileSlot' | 'editing' | 'onSelect' | 'onWatch' | 'onEdit' | 'onRemove' | 'restoreFocus' | 'touch'>

/** Kick off / Half time / Final whistle: a flag, the label and the time — no team, person, score or replay. */
function MarkerRow({ event: e, selected, clock, fileTag, fileSlot, editing, onSelect, onWatch, onEdit, onRemove, restoreFocus, touch = false }: MarkerRowProps) {
    const stop = (ev: React.SyntheticEvent): void => ev.stopPropagation()
    const update = useAppState((s) => s.updateEvent)
    return (
        <li role="option" aria-selected={selected} aria-disabled={e.unlinked ? true : undefined} data-event-id={e.id}
            onClick={onSelect} className={`event-row event-row--marker event-row--${e.type}`}>
            {editing === 'time' ? (
                <span onClick={stop}>
                    <TimeInput ariaLabel="Event time" valueSec={e.matchTimeSec} className="field tc w-full px-1 py-0 text-[13px]"
                        onCommit={(t) => { update(e.id, { matchTimeSec: t }); useAppState.getState().sortEvents(); onEdit(null); restoreFocus() }} />
                </span>
            ) : (
                <span className="tc clock text-[13px]" onDoubleClick={(ev) => { stop(ev); onEdit('time') }} title="Double-click to edit time (in file)">{clock}</span>
            )}
            <span className="team-dot team-dot--none" aria-hidden="true" />
            <span className="event-row__icon"><EventIcon event={e} size={touch ? 22 : 18} /></span>
            <span className="event-row__content"><span className="event-row__main event-row__label">{controlLabel(e)}</span></span>
            <span className="event-row__end">
                <span className="row-score" aria-hidden="true" />
                <FileSlot unlinked={e.unlinked} fileKey={e.sourceFileKey} fileTag={fileTag} show={fileSlot} />
                <WatchButton onWatch={onWatch} disabled={e.unlinked} />
                <span className="row-btn row-btn--gap" aria-hidden="true" />
                {!touch && <span className="row-btn row-btn--gap" aria-hidden="true" />}
                {!touch && (
                    <button type="button" aria-label="Delete event" title="Delete (⌫)" tabIndex={-1}
                        onClick={(ev) => { stop(ev); onRemove() }} className="row-btn delete-btn">×</button>
                )}
            </span>
        </li>
    )
}

interface FileSlotProps {
    unlinked?: boolean
    fileKey?: string
    fileTag: string | null
    show: boolean
}

/** The file badge column: "V2" with several files, "file missing" when unlinked, empty space otherwise so rows line up. */
function FileSlot({ unlinked, fileKey, fileTag, show }: FileSlotProps) {
    if (unlinked) return <span className="tag tag-warn" title={fileKey}>file missing</span>
    if (!show) return null
    return <span className="tag row-file">{fileTag}</span>
}

interface WatchButtonProps {
    onWatch: () => void
    disabled?: boolean
}

/** Row action: seek to the clip start and play (selecting a row never does). */
function WatchButton({ onWatch, disabled = false }: WatchButtonProps) {
    return (
        <button type="button" aria-label="Watch" title="Watch the clip (⏎)" tabIndex={-1} disabled={disabled}
            onClick={(ev) => { ev.stopPropagation(); onWatch() }} className="row-btn watch-btn">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
        </button>
    )
}

interface ScorerEditProps {
    event: MatchEvent
    teams: Team[]
    onDone: () => void
}

function ScorerEdit({ event: e, teams, onDone }: ScorerEditProps) {
    const [query, setQuery] = useState(e.scorer ?? '')
    const [highlighted, setHighlighted] = useState(0)
    const roster = rosterTeamFor(teams, e.team, e.type)
    const pool = useMemo(() => roster?.roster ?? teams.flatMap((t) => t.roster), [roster, teams])
    const candidates = query.trim() ? filterRoster(pool, query) : []

    const save = (name: string): void => {
        const st = useAppState.getState()
        const clean = name.trim()
        st.updateEvent(e.id, { scorer: clean || undefined })
        if (clean && roster && !roster.roster.some((r) => r.toLowerCase() === clean.toLowerCase())) st.addToRoster(roster.name, clean)
        onDone()
    }

    return (
        <span className="relative min-w-0" onClick={(ev) => ev.stopPropagation()}>
            <input
                autoFocus
                aria-label="Scorer"
                value={query}
                onChange={(ev) => { setQuery(ev.target.value); setHighlighted(0) }}
                onKeyDown={(ev) => {
                    ev.stopPropagation()
                    if (ev.key === 'ArrowDown') { ev.preventDefault(); setHighlighted((h) => Math.min(candidates.length - 1, h + 1)) }
                    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setHighlighted((h) => Math.max(0, h - 1)) }
                    else if (ev.key === 'Enter') { ev.preventDefault(); save(candidates[highlighted] ?? query) }
                    else if (ev.key === 'Escape') { ev.preventDefault(); onDone() }
                }}
                onBlur={onDone}
                placeholder="Scorer"
                className="field w-full px-1 py-0 text-[13px]"
            />
            {candidates.length > 0 && (
                <ul role="listbox" aria-label="Scorer suggestions" className="menu absolute left-0 right-0 top-full z-20 mt-0.5 list-none p-1">
                    {candidates.map((n, i) => (
                        <li key={n} role="option" aria-selected={i === highlighted}
                            onMouseDown={(ev) => { ev.preventDefault(); save(n) }}
                            className="menu-item">{n}</li>
                    ))}
                </ul>
            )}
        </span>
    )
}

interface NoteEditProps {
    event: MatchEvent
    onDone: () => void
}

function NoteEdit({ event: e, onDone }: NoteEditProps) {
    const [value, setValue] = useState(e.notes ?? '')
    const finished = useRef(false)
    const finish = (save: boolean): void => {
        if (finished.current) return
        finished.current = true
        const clean = value.trim()
        if (save && clean !== (e.notes ?? '')) useAppState.getState().updateEvent(e.id, { notes: clean || undefined })
        onDone()
    }

    return (
        <span className="min-w-0" onClick={(ev) => ev.stopPropagation()}>
            <input
                autoFocus
                aria-label="Note"
                value={value}
                maxLength={200}
                onChange={(ev) => setValue(ev.target.value)}
                onKeyDown={(ev) => {
                    ev.stopPropagation()
                    if (ev.key === 'Enter') { ev.preventDefault(); finish(true) }
                    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false) }
                }}
                onBlur={() => finish(true)}
                placeholder="Note"
                className="field w-full px-1 py-0 text-[13px]"
            />
        </span>
    )
}

interface UndoIconProps {
    redo?: boolean
}

function UndoIcon({ redo = false }: UndoIconProps) {
    return (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style={redo ? { transform: 'scaleX(-1)' } : undefined}>
            <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
