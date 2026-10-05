import { useRef, useState } from 'react'
import { useAppState, type Panel } from '../state'
import { FloatingPanel } from './FloatingPanel'
import { ProjectIO } from './ProjectIO'

/** The top bar's ⋯: every secondary action in one place (desktop and phone). */
export function OverflowMenu() {
    const open = useAppState((s) => s.panel === 'menu')
    const anchorRef = useRef<HTMLButtonElement | null>(null)

    return (
        <>
            <button ref={anchorRef} type="button" aria-label="Menu" aria-haspopup="menu" aria-expanded={open}
                onClick={() => { const st = useAppState.getState(); if (open) st.closePanel(); else st.openPanel('menu') }}
                className="btn-icon text-[18px]">⋯</button>
            {open && (
                <FloatingPanel label="Menu" anchorRef={anchorRef} placement="below" className="floating--menu"
                    onClose={() => useAppState.getState().closePanel()}>
                    <MenuBody />
                </FloatingPanel>
            )}
        </>
    )
}

const ITEMS: [string, Panel][] = [['Files', 'files'], ['Match setup', 'match'], ['Advanced settings', 'settings'], ['Paste list', 'paste']]

function MenuBody() {
    const events = useAppState((s) => s.events)
    const [confirmNew, setConfirmNew] = useState(false)

    if (confirmNew) {
        return (
            <div role="alertdialog" aria-label="New match" className="flex flex-col gap-3 py-3 text-[13px]">
                <p className="m-0">
                    Clear {events.length} {events.length === 1 ? 'event' : 'events'} and unload the videos? Teams, rosters and clip settings stay. ⌘Z brings the events back.
                </p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { const st = useAppState.getState(); st.newMatch(); st.closePanel() }} className="btn-primary">Clear and start new match</button>
                    <button type="button" onClick={() => setConfirmNew(false)} className="btn-quiet">Keep</button>
                </div>
            </div>
        )
    }

    return (
        <div role="menu" aria-label="Menu" className="menu-list">
            <button type="button" role="menuitem" onClick={() => setConfirmNew(true)}>New match…</button>
            {ITEMS.map(([label, panel]) => (
                <button key={panel} type="button" role="menuitem" onClick={() => useAppState.getState().openPanel(panel)}>{label}</button>
            ))}
            <ProjectIO menu />
        </div>
    )
}
