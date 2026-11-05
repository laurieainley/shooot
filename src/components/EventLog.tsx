import { teamBackground } from '../utils/teamColor'
import { shouldHandleShortcut } from '../utils/shortcuts'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { MatchEvent, Team } from '../types'
import { emptyLogLine } from '../utils/voice'
import { FindGoalsProgress, ReviewRailButton } from './FindGoalsProgress'
import { useDetectJob } from '../detectJobs'
import { findGoalsProgress } from '../utils/findGoalsProgress'
import { NOTE_MAX, controlLabel, hasMark, isMarker } from '../utils/eventTypes'
import { NoteCounter } from './NoteCounter'
import { eventRowParts } from '../utils/eventRow'
import { FindGoalsPrompt } from './FindGoalsPrompt'
import { EventIcon } from './icons/EventIcon'
import { watchFromSec } from '../utils/markers'
import { wantsReplay } from '../utils/replays'
import { filterRoster, rosterTeamFor } from '../utils/roster'
import { formatScore, scoresAfter } from '../utils/score'
import { clockWidthCh, formatEventClock } from '../utils/timeline'
import { TimeInput } from './TimeInput'
import { showToast } from '../toasts'
import { deletedCopy, eventGlobalSec, matchClock } from '../utils/toastCopy'
import { RelinkBanner } from './RelinkBanner'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'
import { ShortcutsButton } from './ShortcutsButton'
import { useTagViewMode } from './tagView'
import { EventActions } from './EventActions'
import { ClipDownload } from './ClipDownload'
import { StarMenu } from './StarMenu'
import { FileSlot, WatchButton } from './RowParts'
import { TeaserSection } from './TeaserSection'
import { starredMoments } from '../utils/teaser'

type Field = 'scorer' | 'team' | 'time' | 'notes'
type Editing = { id: string; field: Field } | null

function isTyping(el: Element | null): boolean {
    return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

export function EventLog() {
    const events = useAppState((s) => s.events)
    const reviewOpen = useAppState((s) => s.panel === 'review')
    const running = useDetectJob((s) => findGoalsProgress(s) !== null)
    const touchView = useTagViewMode() !== 'off' // touch: Find goals lives in the chip over the picture, not in the list
    const finding = !reviewOpen && running && !touchView
    const files = useAppState((s) => s.files)
    const teams = useAppState((s) => s.teams)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartTimeSec = useAppState(selectMatchStartSec)
    const clockLong = useAppState(selectClockLong)
    const canUndo = useAppState((s) => s.undoStack.length > 0 || (s.discardStack.length > 0 && s.discardStack[s.discardStack.length - 1].top === s.undoStack[s.undoStack.length - 1]))
    const canRedo = useAppState((s) => s.redoStack.length > 0)
    const coarse = useMediaQuery(COARSE_QUERY)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    // The same event can be in both lists; which one is selected decides what the keys act on.
    const [section, setSection] = useState<'teaser' | 'match'>('match')
    const [editing, setEditing] = useState<Editing>(null)
    const [starFor, setStarFor] = useState<string | null>(null)
    const rootRef = useRef<HTMLElement | null>(null)
    const listRef = useRef<HTMLDivElement | null>(null)

    const empty = emptyLogLine(coarse, files.length === 0)
    const moments = useMemo(() => starredMoments(events), [events])
    const selectedIndex = section === 'match' ? events.findIndex((e) => e.id === selectedId) : -1
    const teaserIndex = section === 'teaser' ? moments.findIndex((e) => e.id === selectedId) : -1
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const scores = useMemo(() => scoresAfter(events, teams, offsets), [events, teams, offsets])

    // A freshly marked event (picker open on it, once it exists) becomes the selection, so the log shows where it landed.
    const pickerEventId = useAppState((s) => (s.picker?.pending ? undefined : s.picker?.eventId))
    useEffect(() => { if (pickerEventId) { setSection('match'); setSelectedId(pickerEventId) } }, [pickerEventId])

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

    useEffect(() => { setStarFor(null) }, [selectedId, section])

    useEffect(() => {
        if (!selectedId) return
        const sel = section === 'teaser' ? '[data-section="teaser"]' : ':not([data-section])'
        const el = listRef.current?.querySelector<HTMLElement>(`${sel}[data-event-id="${CSS.escape(selectedId)}"]`)
        // The expanded row (with its action row) comes fully into view. When the list scrolls, only the list moves (the
        // page stays, so the video stays in view). No animation when motion is reduced.
        const list = listRef.current
        if (!el || !list) return
        const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const behavior = reduce ? 'auto' : 'smooth'
        // Phone portrait: the list doesn't scroll, the page does (and the video has already scrolled away).
        if (list.scrollHeight <= list.clientHeight) { el.scrollIntoView?.({ block: 'nearest', behavior }); return }
        const top = listScrollFor(list, el)
        if (top !== null) list.scrollTo?.({ top, behavior })
    }, [selectedId, section])

    // Watch = seek to the clip start and play. Selecting a row never moves or starts the video.
    const watch = (e: MatchEvent): void => {
        if (e.unlinked) return
        const st = useAppState.getState()
        if (st.jumpToPreviewEvent(e.id)) return // during the preview: jump to that clip, stay in the preview
        st.seekToGoal(e.sourceFileIndex ?? 0, watchFromSec(e, st.lengthBeforeGoalSec))
    }
    // A teaser row's clip starts at its own seconds before (else the match's).
    const watchTeaser = (e: MatchEvent): void => {
        if (e.unlinked) return
        useAppState.getState().seekToGoal(e.sourceFileIndex ?? 0, Math.max(0, e.matchTimeSec - (e.teaser?.beforeSec ?? before)))
    }
    const toggleTeaserReplay = (e: MatchEvent): void => useAppState.getState().setTeaserEdit(e.id, { replay: e.teaser?.replay ? undefined : true })
    const unstar = (e: MatchEvent): void => {
        const i = moments.findIndex((m) => m.id === e.id)
        const next = moments[i + 1] ?? moments[i - 1]
        useAppState.getState().toggleMark(e.id, 'teaser')
        const top = useAppState.getState().undoStack.at(-1)
        showToast('Unstarred', { label: 'Undo', run: () => { useAppState.getState().undoIfTop(top) } })
        // The next moment, else the same event back in the match list.
        if (next) setSelectedId(next.id)
        else { setSection('match'); setSelectedId(e.id) }
    }
    const selectTeaser = (id: string): void => { setSection('teaser'); setSelectedId((cur) => (section === 'teaser' && cur === id ? null : id)) }
    const selectMatch = (id: string): void => { setSection('match'); setSelectedId((cur) => (section === 'match' && cur === id ? null : id)) }
    const toggleReplay = (e: MatchEvent): void => { if (!isMarker(e)) useAppState.getState().updateEvent(e.id, { replay: !wantsReplay(e) }) }
    const remove = (index: number): void => {
        const e = events[index]
        if (!e) return
        const next = events[index + 1] ?? events[index - 1]
        const st = useAppState.getState()
        const copy = deletedCopy(e.type, matchClock(eventGlobalSec(e, st.cumulativeOffsets), selectMatchStartSec(st), selectClockLong(st)))
        st.removeEvent(e.id)
        const top = useAppState.getState().undoStack.at(-1) // Undo only while the delete is still the latest step
        showToast(copy, { label: 'Undo', run: () => { useAppState.getState().undoIfTop(top) } })
        setSelectedId(next?.id ?? null)
    }

    const onKeyDown = (ev: ReactKeyboardEvent<HTMLElement>): void => {
        // Portalled children (the clip popover) bubble through React; their keys are not the log's.
        if (!(ev.currentTarget as Node).contains(ev.target as Node)) return
        if (isTyping(ev.target as Element) || ev.metaKey || ev.ctrlKey || ev.altKey) return
        // A focused button (action row, Watch) owns Enter/Space and the row shortcuts; only Esc collapses and returns focus to the log.
        if ((ev.target as Element).closest('button')) {
            if (ev.key === 'Escape') {
                ev.preventDefault(); ev.stopPropagation()
                if (selectedId) setSelectedId(null)
                rootRef.current?.focus()
            }
            return
        }
        const sel = events[selectedIndex]
        const tsel = moments[teaserIndex]
        // One list: the teaser rows, then the match rows.
        const nav = [...moments.map((e) => ({ section: 'teaser' as const, id: e.id })), ...events.map((e) => ({ section: 'match' as const, id: e.id }))]
        const at = nav.findIndex((n) => n.section === section && n.id === selectedId)
        const go = (i: number): void => { const n = nav[i]; if (n) { setSection(n.section); setSelectedId(n.id) } }
        const move = (d: number): void => {
            if (nav.length === 0) return
            go(at === -1 ? (d > 0 ? 0 : nav.length - 1) : Math.max(0, Math.min(nav.length - 1, at + d)))
        }
        let handled = true
        switch (ev.key) {
            case 'ArrowDown': move(1); break
            case 'ArrowUp': move(-1); break
            case 'Home': go(0); break
            case 'End': go(nav.length - 1); break
            case 'Enter': if (tsel) watchTeaser(tsel); else if (sel) watch(sel); break
            case 'Delete': case 'Backspace': if (tsel) unstar(tsel); else remove(selectedIndex); break
            case 'r': case 'R': if (tsel) toggleTeaserReplay(tsel); else if (sel) toggleReplay(sel); break
            case 'e': case 'E': if (tsel) useAppState.getState().editTeaser(tsel.id); else if (sel) setEditing({ id: sel.id, field: 'scorer' }); break
            case 't': case 'T': if (tsel) handled = false; else if (sel) setEditing({ id: sel.id, field: 'team' }); break
            case 'n': case 'N': if (tsel) handled = false; else if (sel) setEditing({ id: sel.id, field: 'notes' }); break
            case 's': case 'S': if (sel && !isMarker(sel)) setStarFor(sel.id); else handled = false; break
            case 'g': case 'G': { const st = useAppState.getState(); st.markEvent(st.currentTimeInFileSec); break }
            case 'Escape': if (selectedId) setSelectedId(null); else rootRef.current?.blur(); break
            default: handled = false
        }
        if (handled) { ev.preventDefault(); ev.stopPropagation() }
    }

    return (
        <section
            ref={rootRef}
            id="rail-panel"
            aria-label="Events"
            tabIndex={0}
            onKeyDown={onKeyDown}
            title="L to focus · ↑↓ select · ⏎ watch · R replay · E person · T team · N note · S star · ⌫ delete · Esc back to video"
            className="event-log group/log flex min-h-0 flex-col outline-none"
        >
            <header className="flex items-center gap-1 border-b border-line px-3 py-2">
                <h2 className="m-0 mr-auto voice-heading text-ui-lg">
                    Events <span className="tc text-ui-sm font-normal tracking-normal text-muted">· {events.length}</span>
                </h2>
                {!coarse && (
                    <button type="button" onClick={() => { const st = useAppState.getState(); st.markEvent(st.currentTimeInFileSec) }}
                        disabled={files.length === 0}
                        className="btn-quiet mark-btn">+ Tag event</button>
                )}
                <button type="button" aria-label="Undo" title="Undo (⌘Z)" onClick={() => useAppState.getState().undo()} disabled={!canUndo} className="btn-icon"><UndoIcon /></button>
                <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" onClick={() => useAppState.getState().redo()} disabled={!canRedo} className="btn-icon"><UndoIcon redo /></button>
                {!coarse && <ShortcutsButton />}
            </header>
            <RelinkBanner />

            {events.length === 0 && finding ? <FindGoalsProgress /> : null}
            {events.length > 0 && !touchView && <FindGoalsProgress />}
            {!touchView && <ReviewRailButton />}
            {!finding && <FindGoalsPrompt />}
            {events.length === 0 && !finding ? (
                <>
                    <p className="empty-log m-0 px-3 py-4 text-ui-md text-muted">
                        <strong className="empty-log__lead voice-heading">{empty.lead}</strong>
                        {' '}{empty.key ? <>{empty.hint} <kbd>{empty.key}</kbd> {empty.tail}</> : empty.hint}
                    </p>
                </>
            ) : (
                <div ref={listRef} className="event-list min-h-0 flex-1 overflow-y-auto overscroll-contain"
                    style={{ '--clock-ch': clockWidthCh(clockLong, true) } as CSSProperties}>
                    {moments.length > 0 && (
                        <>
                            <TeaserSection moments={moments} teams={teams} selectedId={section === 'teaser' ? selectedId : null} touch={coarse}
                                clockOf={(e) => formatEventClock((offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec, e.matchTimeSec, matchStartTimeSec, clockLong)}
                                onSelect={selectTeaser} onWatch={(e) => { setSection('teaser'); setSelectedId(e.id); watchTeaser(e) }}
                                onToggleReplay={toggleTeaserReplay} onEdit={(e) => useAppState.getState().editTeaser(e.id)}
                                onFraming={(e) => useAppState.getState().editTeaser(e.id, 'framing')} onUnstar={unstar} />
                            <h3 className="teaser-section__head teaser-section__head--match"><span className="teaser-section__title">Match</span></h3>
                        </>
                    )}
                    <ol role="listbox" aria-label="Event list" className="event-list__rows m-0 list-none p-0">
                        {events.map((e) => (
                            <EventRow
                                key={e.id}
                                event={e}
                                teams={teams}
                                selected={section === 'match' && e.id === selectedId}
                                clock={formatEventClock((offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec, e.matchTimeSec, matchStartTimeSec, clockLong)}
                                score={scores.get(e.id)}
                                editing={editing?.id === e.id ? editing.field : null}
                                onSelect={() => selectMatch(e.id)}
                                onWatch={() => { setSection('match'); setSelectedId(e.id); watch(e) }}
                                onEdit={(field) => { setSection('match'); setSelectedId(e.id); setEditing(field ? { id: e.id, field } : null) }}
                                onToggleReplay={() => toggleReplay(e)}
                                onFraming={() => useAppState.getState().editEvent(e.id, 'framing')}
                                onRemove={() => remove(events.indexOf(e))}
                                starOpen={section === 'match' && starFor === e.id}
                                onStarOpen={(open) => setStarFor(open ? e.id : null)}
                                restoreFocus={() => rootRef.current?.focus()}
                                touch={coarse}
                            />
                        ))}
                    </ol>
                </div>
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
    editing: Field | null
    onSelect: () => void
    onWatch: () => void
    onEdit: (field: Field | null) => void
    onToggleReplay: () => void
    onFraming: () => void
    onRemove: () => void
    starOpen: boolean
    onStarOpen: (open: boolean) => void
    restoreFocus: () => void
    /** Touch: larger icon and action buttons. */
    touch?: boolean
}

function EventRow({ event: e, teams, selected, clock, score, editing, onSelect, onWatch, onEdit, onToggleReplay, onFraming, onRemove, starOpen, onStarOpen, restoreFocus, touch = false }: EventRowProps) {
    const team = teams.find((t) => t.name === e.team)
    const parts = eventRowParts(e)
    const title = `${parts.title}${e.team ? ` – ${e.team}` : ''}`
    const stop = (ev: React.SyntheticEvent): void => ev.stopPropagation()
    const done = (): void => { onEdit(null); restoreFocus() }
    const update = useAppState((s) => s.updateEvent)

    if (isMarker(e)) return <MarkerRow event={e} selected={selected} clock={clock} editing={editing} onSelect={onSelect} onWatch={onWatch} onEdit={onEdit} onRemove={onRemove} restoreFocus={restoreFocus} touch={touch} />

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
                        className="field tc w-full px-1 py-0 text-ui-sm"
                    />
                </span>
            ) : (
                <span className="tc clock text-ui-sm" onDoubleClick={(ev) => { stop(ev); onEdit('time') }} title="Double-click to edit time (in file)">{clock}</span>
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
                            className="btn-quiet flex items-center gap-1 px-1.5 py-0 text-ui-sm">
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
                            ? <span className="ev-person">{parts.person}</span>
                            : <span className="event-row__type">{controlLabel(e)}</span>}
                    </span>
                    {hasMark(e, 'teaser') && <span role="img" aria-label="Starred: teaser" title="Starred: teaser" className="event-row__star">★</span>}
                    {parts.note && <span className="event-row__note" onDoubleClick={(ev) => { stop(ev); onEdit('notes') }}>{parts.note}</span>}
                    {wantsReplay(e) && <span className="event-row__replay" title="Slow-mo replay on"><span aria-hidden="true">↻</span><span className="sr-only">slow-mo replay</span></span>}
                </span>
            )}

            <span className="event-row__end">
                <span {...(score ? { 'data-score': '' } : {})} className="tc row-score" title={score ? 'Score after this goal' : undefined}>{score ? formatScore(score) : null}</span>
                <FileSlot unlinked={e.unlinked} fileKey={e.sourceFileKey} />
                <WatchButton onWatch={onWatch} disabled={e.unlinked} />
            </span>
            {selected && <EventActions event={e} touch={touch} onToggleReplay={onToggleReplay} onFraming={onFraming}
                onEdit={() => useAppState.getState().editEvent(e.id)} onRemove={onRemove} star={<StarMenu event={e} open={starOpen} onOpenChange={onStarOpen} />} download={<ClipDownload event={e} />} />}
        </li>
    )
}

type MarkerRowProps = Pick<EventRowProps, 'event' | 'selected' | 'clock' | 'editing' | 'onSelect' | 'onWatch' | 'onEdit' | 'onRemove' | 'restoreFocus' | 'touch'>

/** Kick off / Half time / Final whistle: a flag, the label and the time — no team, person, score or replay. */
function MarkerRow({ event: e, selected, clock, editing, onSelect, onWatch, onEdit, onRemove, restoreFocus, touch = false }: MarkerRowProps) {
    const stop = (ev: React.SyntheticEvent): void => ev.stopPropagation()
    const update = useAppState((s) => s.updateEvent)
    return (
        <li role="option" aria-selected={selected} aria-disabled={e.unlinked ? true : undefined} data-event-id={e.id}
            onClick={onSelect} className={`event-row event-row--marker event-row--${e.type}`}>
            {editing === 'time' ? (
                <span onClick={stop}>
                    <TimeInput ariaLabel="Event time" valueSec={e.matchTimeSec} className="field tc w-full px-1 py-0 text-ui-sm"
                        onCommit={(t) => { update(e.id, { matchTimeSec: t }); useAppState.getState().sortEvents(); onEdit(null); restoreFocus() }} />
                </span>
            ) : (
                <span className="tc clock text-ui-sm" onDoubleClick={(ev) => { stop(ev); onEdit('time') }} title="Double-click to edit time (in file)">{clock}</span>
            )}
            <span className="team-dot team-dot--none" aria-hidden="true" />
            <span className="event-row__icon"><EventIcon event={e} size={touch ? 22 : 18} /></span>
            <span className="event-row__content"><span className="event-row__main event-row__label">{controlLabel(e)}</span></span>
            <span className="event-row__end">
                <span className="row-score" aria-hidden="true" />
                <FileSlot unlinked={e.unlinked} fileKey={e.sourceFileKey} />
                <WatchButton onWatch={onWatch} disabled={e.unlinked} />
            </span>
            {selected && <EventActions event={e} touch={touch} onToggleReplay={() => undefined} onFraming={() => undefined}
                onEdit={() => useAppState.getState().editEvent(e.id)} onRemove={onRemove} />}
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
                className="field w-full px-1 py-0 text-ui-md"
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
                maxLength={NOTE_MAX}
                onChange={(ev) => setValue(ev.target.value)}
                onKeyDown={(ev) => {
                    ev.stopPropagation()
                    if (ev.key === 'Enter') { ev.preventDefault(); finish(true) }
                    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false) }
                }}
                onBlur={() => finish(true)}
                placeholder="Note"
                className="field w-full px-1 py-0 text-ui-md"
            />
            <NoteCounter value={value} />
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

/** Where to scroll the list so `row` is fully visible inside it (honouring its scroll-padding-bottom), or null when it already is. */
function listScrollFor(list: HTMLElement, row: HTMLElement): number | null {
    const l = list.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    const padBottom = parseFloat(getComputedStyle(list).scrollPaddingBottom) || 0
    if (r.top < l.top) return list.scrollTop - (l.top - r.top)
    const over = r.bottom - (l.bottom - padBottom)
    return over > 0 ? list.scrollTop + over : null
}
