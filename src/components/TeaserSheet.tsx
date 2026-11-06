import { useEffect, useRef, useState } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { MatchEvent } from '../types'
import { teaserLine } from '../graphics/plan'
import { NOTE_MAX, TEASER_SEC_MAX, controlLabel, hasMark } from '../utils/eventTypes'
import { formatEventClock } from '../utils/timeline'
import { ColumnPanel } from './ColumnPanel'
import { NoteCounter } from './NoteCounter'
import { ReplayFraming } from './ReplayFraming'

const close = (): void => useAppState.getState().closePanel()
const read = (id: string): MatchEvent | undefined => useAppState.getState().events.find((x) => x.id === id)

/** Both teaser views go away with the star (unstar, undo). */
function useCloseWhenUnstarred(e: MatchEvent): boolean {
    const starred = hasMark(e, 'teaser')
    useEffect(() => { if (!starred) close() }, [starred])
    return starred
}

/** The Framing action's view for a teaser: how the teaser clip is framed, or its slow-mo replay while that is on. */
export function TeaserFramingBody({ event: e }: { event: MatchEvent }) {
    const starred = useCloseWhenUnstarred(e)
    if (!starred) return null
    return (
        <ColumnPanel label={e.teaser?.replay ? 'Teaser replay framing' : 'Teaser framing'} onClose={close} className="event-sheet">
            <ReplayFraming event={e} target="teaser" />
        </ColumnPanel>
    )
}

const secText = (n: number | undefined): string => (n === undefined ? '' : String(n))
const parseSec = (text: string): number | undefined => {
    if (text.trim() === '') return undefined
    const n = Number(text)
    return Number.isFinite(n) ? Math.min(TEASER_SEC_MAX, Math.max(0, n)) : undefined
}

/**
 * The Edit view of one starred moment's teaser clip: its caption, seconds before / after, slow-mo replay. Each change is applied at once
 * (one undo step); typed values are saved on Enter, when the field loses focus and when the sheet closes. "Reset to automatic" clears them all.
 */
export function TeaserSheet({ event: e }: { event: MatchEvent }) {
    const starred = useCloseWhenUnstarred(e)
    const offset = useAppState((s) => s.cumulativeOffsets[e.sourceFileIndex ?? 0] ?? 0)
    const matchStartSec = useAppState(selectMatchStartSec)
    const clockLong = useAppState(selectClockLong)
    const matchBefore = useAppState((s) => s.lengthBeforeGoalSec)
    const matchAfter = useAppState((s) => s.lengthAfterGoalSec)
    const theme = useAppState((s) => s.graphics.theme)
    const t = e.teaser
    const [caption, setCaption] = useState(t?.caption ?? '')
    const [before, setBefore] = useState(secText(t?.beforeSec))
    const [after, setAfter] = useState(secText(t?.afterSec))
    // Drafts follow the data when it changes underneath (reset, undo…).
    useEffect(() => setCaption(t?.caption ?? ''), [t?.caption])
    useEffect(() => setBefore(secText(t?.beforeSec)), [t?.beforeSec])
    useEffect(() => setAfter(secText(t?.afterSec)), [t?.afterSec])
    const latest = useRef({ caption, before, after })
    latest.current = { caption, before, after }
    if (!starred) return null

    const patch = (p: Parameters<ReturnType<typeof useAppState.getState>['setTeaserEdit']>[1]): void => useAppState.getState().setTeaserEdit(e.id, p)
    // Read from the store: a blur can land after another change.
    const saveCaption = (text: string): void => {
        const cur = read(e.id)
        if (cur && text.trim() !== (cur.teaser?.caption ?? '')) patch({ caption: text.trim() || undefined })
    }
    const saveSec = (key: 'beforeSec' | 'afterSec', text: string): void => {
        const cur = read(e.id)
        const next = parseSec(text)
        if (cur && next !== cur.teaser?.[key]) patch({ [key]: next })
    }
    const saveAll = (): void => {
        const l = latest.current
        saveCaption(l.caption); saveSec('beforeSec', l.before); saveSec('afterSec', l.after)
    }
    const done = (): void => { saveAll(); close() }
    const replay = t?.replay === true
    const clock = formatEventClock(offset + e.matchTimeSec, e.matchTimeSec, matchStartSec, clockLong)
    const automatic = teaserLine({ ...e, teaser: undefined }, theme)
    const onEnter = (save: () => void) => (ev: React.KeyboardEvent<HTMLInputElement>): void => {
        if (ev.key === 'Enter') { ev.preventDefault(); save(); ev.currentTarget.blur() }
    }

    return (
        <ColumnPanel label={`Teaser: ${controlLabel(e)} · ${clock}`} onClose={done} className="event-sheet">
            <fieldset className="event-sheet__group">
                <legend>Caption</legend>
                <input
                    aria-label="Caption"
                    className="field event-sheet__input"
                    value={caption}
                    maxLength={NOTE_MAX}
                    placeholder="Type your own line"
                    enterKeyHint="done"
                    autoComplete="off"
                    onChange={(ev) => setCaption(ev.target.value)}
                    onKeyDown={onEnter(() => saveCaption(caption))}
                    onBlur={() => saveCaption(latest.current.caption)}
                />
                {caption.trim() === '' && <p className="teaser-hint">Automatic: {automatic}</p>}
                <NoteCounter value={caption} />
            </fieldset>

            <fieldset className="event-sheet__group">
                <legend>Length</legend>
                <div className="teaser-secs">
                    <label className="teaser-secs__field">
                        <span>Seconds before <span className="teaser-secs__max">(max {TEASER_SEC_MAX})</span></span>
                        <input type="number" inputMode="numeric" min={0} max={TEASER_SEC_MAX} aria-label="Seconds before" className="field event-sheet__input"
                            value={before} placeholder={String(Math.min(matchBefore, TEASER_SEC_MAX))} onChange={(ev) => setBefore(ev.target.value)}
                            onKeyDown={onEnter(() => saveSec('beforeSec', before))} onBlur={() => saveSec('beforeSec', latest.current.before)} />
                    </label>
                    <label className="teaser-secs__field">
                        <span>Seconds after <span className="teaser-secs__max">(max {TEASER_SEC_MAX})</span></span>
                        <input type="number" inputMode="numeric" min={0} max={TEASER_SEC_MAX} aria-label="Seconds after" className="field event-sheet__input"
                            value={after} placeholder={String(Math.min(matchAfter, TEASER_SEC_MAX))} onChange={(ev) => setAfter(ev.target.value)}
                            onKeyDown={onEnter(() => saveSec('afterSec', after))} onBlur={() => saveSec('afterSec', latest.current.after)} />
                    </label>
                </div>
            </fieldset>

            <div className="teaser-replay">
                <button type="button" role="switch" aria-checked={replay} aria-label="Teaser slow-mo replay" className="act-btn act-btn--touch act-switch"
                    onClick={() => patch({ replay: replay ? undefined : true })}>
                    <span>Slow-mo replay</span>
                    <span className="act-switch__pill">{replay ? 'On' : 'Off'}</span>
                </button>
                <button type="button" className="act-btn act-btn--touch" aria-label="Teaser framing" title={replay ? 'Teaser replay framing (zoom to the goal)' : 'Teaser framing (zoom in on this moment)'}
                    onClick={() => { saveAll(); useAppState.getState().editTeaser(e.id, 'framing') }}>
                    <span aria-hidden="true">⌖</span><span>Framing</span>
                </button>
            </div>

            <button type="button" className="link-btn teaser-reset" disabled={!t}
                onClick={() => patch({ caption: undefined, beforeSec: undefined, afterSec: undefined, replay: undefined, replayCrop: undefined, crop: undefined })}>Reset to automatic</button>

            <div className="sheet__actions">
                <button type="button" className="btn-quiet btn-danger" onClick={() => { useAppState.getState().toggleMark(e.id, 'teaser'); close() }}>Unstar</button>
                <span className="flex-1" />
                <button type="button" className="btn-primary" onClick={done}>Done</button>
            </div>
        </ColumnPanel>
    )
}
