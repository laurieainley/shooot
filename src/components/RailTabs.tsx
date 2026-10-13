import { useEffect, type KeyboardEvent } from 'react'
import { useAppState } from '../state'
import { shouldHandleShortcut } from '../utils/shortcuts'
import { railTabStore, setRailTab, useRailTab, type RailTab } from './railTab'

const TABS: { id: RailTab; label: string }[] = [{ id: 'events', label: 'Events' }, { id: 'matches', label: 'Matches' }]

/** Events | Matches switch at the top of the rail. Opens on Matches when there is nothing in the editor yet. */
export function RailTabs() {
    const tab = useRailTab()

    // Once on mount: an empty editor starts on the list of saved matches.
    useEffect(() => {
        const st = useAppState.getState()
        if (st.files.length === 0 && st.events.length === 0) setRailTab('matches')
    }, [])

    // L focuses the event log; from the Matches tab it first brings the Events tab back.
    useEffect(() => {
        const onKey = (e: globalThis.KeyboardEvent): void => {
            if (e.key !== 'l' && e.key !== 'L') return
            if (e.metaKey || e.ctrlKey || e.altKey || railTabStore.getState().tab === 'events') return
            const st = useAppState.getState()
            if (!shouldHandleShortcut(e.target, { modalOpen: !!(st.picker || st.panel) })) return
            e.preventDefault()
            setRailTab('events')
            requestAnimationFrame(() => document.querySelector<HTMLElement>('.event-log')?.focus())
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const next = TABS[(TABS.findIndex((t) => t.id === tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
        setRailTab(next.id)
        requestAnimationFrame(() => document.getElementById(`rail-tab-${next.id}`)?.focus())
    }

    return (
        <div role="tablist" aria-label="Rail" className="rail-tabs" onKeyDown={onKeyDown}>
            {TABS.map((t) => (
                <button key={t.id} id={`rail-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls="rail-panel"
                    tabIndex={tab === t.id ? 0 : -1} onClick={() => setRailTab(t.id)}>{t.label}</button>
            ))}
        </div>
    )
}
