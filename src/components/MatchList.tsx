import { useCallback, useEffect, useState } from 'react'
import { listMatches, type MatchListItem } from '../files/matchStore'
import { blockerText, openMatch, removeMatch, startNewMatch, stopBlocker, switchBlocker } from './matchSwitch'
import { setRailTab } from './railTab'
import { useMatchesVersion, useOpenMatch } from './openMatch'

type Pending = { kind: 'open'; id: string } | { kind: 'new' }

/** "Thu 9 Oct" */
function shortDate(ms: number): string {
    const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(ms))
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('weekday')} ${get('day')} ${get('month')}`
}

function DotsIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <circle cx="5" cy="12" r="1.9" fill="currentColor" /><circle cx="12" cy="12" r="1.9" fill="currentColor" /><circle cx="19" cy="12" r="1.9" fill="currentColor" />
        </svg>
    )
}

const BROKEN = 'Couldn’t open this match'

/** The Matches tab: matches saved on this device, newest first. */
export function MatchList() {
    const openId = useOpenMatch((s) => s.id)
    const saveError = useOpenMatch((s) => s.saveError)
    const version = useMatchesVersion()
    const [items, setItems] = useState<MatchListItem[] | null>(null)
    const [broken, setBroken] = useState<Set<string>>(new Set())
    const [pending, setPending] = useState<Pending | null>(null)
    const [menuFor, setMenuFor] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        void listMatches().then((l) => { if (live) setItems(l) }, () => { if (live) setItems([]) })
        return () => { live = false }
    }, [openId, version])

    const go = useCallback(async (p: Pending): Promise<void> => {
        setPending(null)
        if (p.kind === 'new') { await startNewMatch(); return }
        if (p.id === openId) { setRailTab('events'); return }
        if (!(await openMatch(p.id))) setBroken((b) => new Set(b).add(p.id))
    }, [openId])

    const choose = (p: Pending): void => {
        setMenuFor(null)
        if (switchBlocker()) setPending(p)
        else void go(p)
    }
    const blocker = pending ? switchBlocker() : null
    const remove = (id: string): void => { setMenuFor(null); void removeMatch(id) }

    return (
        <section role="tabpanel" id="rail-panel" aria-labelledby="rail-tab-matches" className="match-list">
            <header className="match-list__head">
                <h2 className="m-0 voice-heading text-[15px]">Matches</h2>
                <button type="button" className="btn-quiet" onClick={() => choose({ kind: 'new' })}>+ New match</button>
            </header>
            {saveError && <p className="match-list__note m-0">Couldn’t save this match on this device</p>}
            {pending && blocker && (
                <div role="alertdialog" aria-label="Switch match" className="match-list__confirm">
                    <p className="m-0">{blockerText(blocker)}</p>
                    <div className="match-list__confirm-actions">
                        <button type="button" className="btn-quiet" onClick={() => { stopBlocker(); void go(pending) }}>Stop and switch</button>
                        <button type="button" className="btn-quiet" onClick={() => setPending(null)}>Cancel</button>
                    </div>
                </div>
            )}
            {items && items.length === 0 && (
                <p className="match-list__empty m-0">No saved matches yet. Add videos or tag a moment and this match is saved here on its own.</p>
            )}
            <ul className="match-list__rows m-0 list-none p-0">
                {(items ?? []).map((it) => {
                    if (it.broken || broken.has(it.id)) {
                        return (
                            <li key={it.id} className="match-row match-row--broken">
                                <span className="match-row__main"><span className="match-row__title">{BROKEN}</span></span>
                                <button type="button" className="btn-quiet" onClick={() => remove(it.id)}>Delete</button>
                            </li>
                        )
                    }
                    const { summary: s } = it
                    const isOpen = it.id === openId
                    return (
                        <li key={it.id} className={`match-row${isOpen ? ' match-row--open' : ''}`}>
                            <button type="button" className="match-row__main" onClick={() => choose({ kind: 'open', id: it.id })}>
                                <span className="match-row__line">
                                    <span className="match-row__title">{s.title}</span>
                                    {s.score && <span className="match-row__score">{s.score[0]}–{s.score[1]}</span>}
                                </span>
                                <span className="match-row__meta">
                                    {shortDate(s.dateMs)} · {s.fileCount === 0 ? 'no videos' : `${s.fileCount} ${s.fileCount === 1 ? 'file' : 'files'}`}
                                    {isOpen && <span className="match-row__tag">Open</span>}
                                </span>
                            </button>
                            <button type="button" className="btn-icon" aria-label={`More for ${s.title}`} aria-haspopup="menu" aria-expanded={menuFor === it.id}
                                onClick={() => setMenuFor(menuFor === it.id ? null : it.id)}><DotsIcon /></button>
                            {menuFor === it.id && (
                                <div role="menu" aria-label={`${s.title} actions`} className="match-row__menu">
                                    <button type="button" role="menuitem" className="btn-quiet" onClick={() => remove(it.id)}>Delete</button>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
