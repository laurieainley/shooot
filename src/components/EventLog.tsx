import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppState } from '../state'
import type { MatchEvent, Team } from '../types'
import { eventLabel } from '../utils/eventTypes'
import { wantsReplay } from '../utils/replays'
import { filterRoster, rosterTeamFor } from '../utils/roster'
import { formatEventClock } from '../utils/timeline'
import { parseBulkPaste } from '../utils/bulkPaste'
import { TimeInput } from './TimeInput'

type Editing = { id: string; field: 'scorer' | 'team' | 'time' } | null

function isTyping(el: Element | null): boolean {
    return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

export function EventLog() {
    const events = useAppState((s) => s.events)
    const files = useAppState((s) => s.files)
    const teams = useAppState((s) => s.teams)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const canUndo = useAppState((s) => s.undoStack.length > 0)
    const canRedo = useAppState((s) => s.redoStack.length > 0)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [editing, setEditing] = useState<Editing>(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const [pasting, setPasting] = useState(false)
    const [pasteText, setPasteText] = useState('')
    const rootRef = useRef<HTMLElement | null>(null)
    const listRef = useRef<HTMLOListElement | null>(null)

    const selectedIndex = events.findIndex((e) => e.id === selectedId)

    // A freshly marked event (picker open on it) becomes the selection, so the log shows where it landed.
    const pickerEventId = useAppState((s) => s.picker?.eventId)
    useEffect(() => { if (pickerEventId) setSelectedId(pickerEventId) }, [pickerEventId])

    // Global L focuses the log (never while typing or while the event picker is open).
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key !== 'l' && e.key !== 'L') return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            if (useAppState.getState().picker || isTyping(document.activeElement)) return
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

    const seek = (e: MatchEvent): void => {
        if (e.unlinked) return
        const st = useAppState.getState()
        st.seekToGoal(e.sourceFileIndex ?? 0, Math.max(0, e.matchTimeSec - st.lengthBeforeGoalSec))
    }
    const toggleReplay = (e: MatchEvent): void => useAppState.getState().updateEvent(e.id, { replay: !wantsReplay(e) })
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
            case 'Enter': if (sel) seek(sel); break
            case 'Delete': case 'Backspace': remove(selectedIndex); break
            case 'r': case 'R': if (sel) toggleReplay(sel); break
            case 'e': case 'E': if (sel) setEditing({ id: sel.id, field: 'scorer' }); break
            case 't': case 'T': if (sel) setEditing({ id: sel.id, field: 'team' }); break
            case 'g': case 'G': { const st = useAppState.getState(); st.markEvent(st.currentTimeInFileSec); break }
            case 'Escape': rootRef.current?.blur(); break
            default: handled = false
        }
        if (handled) { ev.preventDefault(); ev.stopPropagation() }
    }

    const addPasted = (): void => {
        const idx = useAppState.getState().currentFileIndex
        for (const e of parseBulkPaste(pasteText, idx)) useAppState.getState().addEvent(e)
        setPasteText('')
        setPasting(false)
    }

    return (
        <section
            ref={rootRef}
            aria-label="Events"
            tabIndex={0}
            onKeyDown={onKeyDown}
            title="L to focus · ↑↓ select · ⏎ watch · R replay · E scorer · T team · ⌫ delete · Esc back to video"
            className="event-log group/log flex min-h-0 flex-col outline-none"
        >
            <header className="flex items-center gap-1 border-b border-line px-3 py-2">
                <h2 className="m-0 mr-auto font-display text-[15px] font-semibold uppercase tracking-[0.08em]">
                    Events <span className="tc text-[13px] font-normal tracking-normal text-muted">· {events.length}</span>
                </h2>
                <button type="button" onClick={() => { const st = useAppState.getState(); st.markEvent(st.currentTimeInFileSec) }}
                    disabled={files.length === 0}
                    className="btn-quiet">+ Event</button>
                <button type="button" aria-label="Undo" title="Undo (⌘Z)" onClick={() => useAppState.getState().undo()} disabled={!canUndo} className="btn-icon">↶</button>
                <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" onClick={() => useAppState.getState().redo()} disabled={!canRedo} className="btn-icon">↷</button>
                <div className="relative">
                    <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} className="btn-icon">⋯</button>
                    {menuOpen && (
                        <div role="menu" className="menu absolute right-0 top-full z-20 mt-1">
                            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setPasting(true) }}>Paste list</button>
                        </div>
                    )}
                </div>
            </header>

            {pasting && (
                <div className="flex flex-col gap-2 border-b border-line bg-sunk px-3 py-2">
                    <textarea
                        autoFocus
                        aria-label="Paste list"
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder={'07:12 Whites - Sam\n23:41 Colours - Jo'}
                        className="field tc h-20 resize-y text-[13px]"
                    />
                    <div className="flex gap-2">
                        <button type="button" onClick={addPasted} className="btn-primary">Add events</button>
                        <button type="button" onClick={() => setPasting(false)} className="btn-quiet">Cancel</button>
                    </div>
                </div>
            )}

            {events.length === 0 ? (
                <p className="m-0 px-3 py-4 text-[13px] text-muted">
                    No events yet. {files.length === 0 ? 'Load a video, then press ' : 'Press '}<kbd>G</kbd> while it plays.
                </p>
            ) : (
                <ol ref={listRef} role="listbox" aria-label="Event list" className="m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-0">
                    {events.map((e) => (
                        <EventRow
                            key={e.id}
                            event={e}
                            teams={teams}
                            selected={e.id === selectedId}
                            clock={formatEventClock((offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec, e.matchTimeSec, matchStartTimeSec)}
                            fileTag={files.length > 1 ? `V${(e.sourceFileIndex ?? 0) + 1}` : null}
                            editing={editing?.id === e.id ? editing.field : null}
                            onSelect={() => { setSelectedId(e.id); seek(e) }}
                            onEdit={(field) => { setSelectedId(e.id); setEditing(field ? { id: e.id, field } : null) }}
                            onToggleReplay={() => toggleReplay(e)}
                            onRemove={() => remove(events.indexOf(e))}
                            restoreFocus={() => rootRef.current?.focus()}
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
    fileTag: string | null
    editing: 'scorer' | 'team' | 'time' | null
    onSelect: () => void
    onEdit: (field: 'scorer' | 'team' | 'time' | null) => void
    onToggleReplay: () => void
    onRemove: () => void
    restoreFocus: () => void
}

function EventRow({ event: e, teams, selected, clock, fileTag, editing, onSelect, onEdit, onToggleReplay, onRemove, restoreFocus }: EventRowProps) {
    const team = teams.find((t) => t.name === e.team)
    const replay = wantsReplay(e)
    const label = `${eventLabel(e)}${e.scorer ? ` · ${e.scorer}` : ''}`
    const stop = (ev: React.SyntheticEvent): void => ev.stopPropagation()
    const done = (): void => { onEdit(null); restoreFocus() }
    const update = useAppState((s) => s.updateEvent)

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
                <span className="tc text-[13px]" onDoubleClick={(ev) => { stop(ev); onEdit('time') }} title="Double-click to edit time (in file)">{clock}</span>
            )}

            <span
                data-team-dot
                className="team-dot"
                style={{ background: team?.color ?? 'var(--muted)' }}
                title={e.team ? `${e.team} · double-click to change` : 'No team · double-click to set'}
                onDoubleClick={(ev) => { stop(ev); onEdit('team') }}
            />

            {editing === 'team' ? (
                <span className="flex min-w-0 gap-1" onClick={stop}>
                    {teams.map((t) => (
                        <button key={t.name} type="button" autoFocus={t.name === e.team || (!e.team && t === teams[0])}
                            onClick={() => { update(e.id, { team: t.name }); done() }}
                            onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done() } }}
                            className="btn-quiet flex items-center gap-1 px-1.5 py-0 text-[12px]">
                            <span className="team-dot" style={{ background: t.color }} />{t.name}
                        </button>
                    ))}
                </span>
            ) : editing === 'scorer' ? (
                <ScorerEdit event={e} teams={teams} onDone={done} />
            ) : (
                <span className="truncate text-[13px]" onDoubleClick={(ev) => { stop(ev); onEdit('scorer') }} title={e.team ? `${label} – ${e.team}` : label}>
                    {label}
                </span>
            )}

            <span className="flex items-center gap-1.5">
                {e.unlinked
                    ? <span className="tag tag-warn" title={e.sourceFileKey}>file missing</span>
                    : fileTag && <span className="tag">{fileTag}</span>}
                <button type="button" aria-label="Replay" aria-pressed={replay} title={replay ? 'Slow-mo replay on (R)' : 'Slow-mo replay off (R)'}
                    tabIndex={-1} onClick={(ev) => { stop(ev); onToggleReplay() }} className="row-btn replay-btn">↻</button>
                <button type="button" aria-label="Delete event" title="Delete (⌫)" tabIndex={-1}
                    onClick={(ev) => { stop(ev); onRemove() }} className="row-btn delete-btn">×</button>
            </span>
        </li>
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
