import { useRef, useState } from 'react'
import { useAppState, type Panel } from '../state'
import { FloatingPanel } from './FloatingPanel'
import { ProjectIO } from './ProjectIO'
import { clearHandles } from '../files/handleStore'
import type { Layout } from './useMediaQuery'

interface OverflowMenuProps {
    /** Desktop and tablet have a Setup button in the bar; narrower layouts keep it in here. */
    layout?: Layout
}

/** The top bar's ⋯: every secondary action in one place (desktop and phone). */
export function OverflowMenu({ layout = 'desktop' }: OverflowMenuProps) {
    const open = useAppState((s) => s.panel === 'menu')
    const anchorRef = useRef<HTMLButtonElement | null>(null)

    return (
        <>
            <button ref={anchorRef} type="button" aria-label="Menu" aria-haspopup="menu" aria-expanded={open}
                onClick={() => { const st = useAppState.getState(); if (open) st.closePanel(); else st.openPanel('menu') }}
                className="top-btn top-btn--quiet top-btn--icon"><DotsIcon /></button>
            {open && (
                <FloatingPanel label="Menu" anchorRef={anchorRef} placement="below" className="floating--menu"
                    onClose={() => useAppState.getState().closePanel()}>
                    <MenuBody setupInMenu={layout !== 'desktop' && layout !== 'tablet'} />
                </FloatingPanel>
            )}
        </>
    )
}

function DotsIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <circle cx="5" cy="12" r="1.9" fill="currentColor" /><circle cx="12" cy="12" r="1.9" fill="currentColor" /><circle cx="19" cy="12" r="1.9" fill="currentColor" />
        </svg>
    )
}

type MenuItem = { label: string; panel: Panel; aria?: string }

interface MenuBodyProps {
    setupInMenu: boolean
}

function MenuBody({ setupInMenu }: MenuBodyProps) {
    const events = useAppState((s) => s.events)
    const [confirmNew, setConfirmNew] = useState(false)
    const items: MenuItem[] = [
        { label: 'Files', panel: 'files' },
        ...(setupInMenu ? [{ label: 'Setup', panel: 'match' as const, aria: 'Match setup' }] : []),
        { label: 'Advanced settings', panel: 'settings' },
        { label: 'Paste list', panel: 'paste' },
    ]

    if (confirmNew) {
        return (
            <div role="alertdialog" aria-label="New match" className="flex flex-col gap-3 py-3 text-[13px]">
                <p className="m-0">
                    Clear {events.length} {events.length === 1 ? 'event' : 'events'} and unload the videos? Teams, rosters and clip settings stay. ⌘Z brings the events back.
                </p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { const st = useAppState.getState(); st.newMatch(); st.closePanel(); void clearHandles() }} className="btn-primary">Clear and start new match</button>
                    <button type="button" onClick={() => setConfirmNew(false)} className="btn-quiet">Keep</button>
                </div>
            </div>
        )
    }

    return (
        <div role="menu" aria-label="Menu" className="menu-list">
            <button type="button" role="menuitem" onClick={() => setConfirmNew(true)}>New match…</button>
            {items.map(({ label, panel, aria }) => (
                <button key={panel} type="button" role="menuitem" aria-label={aria} onClick={() => useAppState.getState().openPanel(panel)}>{label}</button>
            ))}
            <button type="button" role="menuitem" onClick={() => useAppState.getState().openPanel('send')}>Send project to another device</button>
            <ProjectIO menu />
            <button type="button" role="menuitem" onClick={() => useAppState.getState().openPanel('shortcuts')}>Shortcuts</button>
        </div>
    )
}
