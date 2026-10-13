import { useRef, useState } from 'react'
import { useAppState, type Panel } from '../state'
import { AiTag } from './AiTag'
import { useDetectJob } from '../detectJobs'
import { findGoalsProgress } from '../utils/findGoalsProgress'
import { openFindGoals, useSuggestionsCurrent } from './findGoals'
import { FloatingPanel } from './FloatingPanel'
import { ProjectIO } from './ProjectIO'
import { blockerText, startNewMatch, stopBlocker, switchBlocker, type SwitchBlocker } from './matchSwitch'
import type { Layout } from './useMediaQuery'

interface OverflowMenuProps {
    /** Desktop and tablet have a Match setup button in the bar; narrower layouts keep it in here. */
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
    const anySuggestions = useAppState((s) => s.suggestions.length > 0)
    const suggestionsCurrent = useSuggestionsCurrent()
    const running = findGoalsProgress(useDetectJob((j) => j))
    const hasSuggestions = anySuggestions && suggestionsCurrent
    const hasFiles = useAppState((s) => s.files.length > 0)
    const labs = useAppState((s) => s.labs)
    const labsSeen = useAppState((s) => s.labsSeen)
    const [blocker, setBlocker] = useState<SwitchBlocker>(null)
    const items: MenuItem[] = [
        ...(setupInMenu ? [{ label: 'Match setup', panel: 'match' as const }] : []),
        { label: 'Advanced settings', panel: 'settings' },
    ]

    if (blocker) {
        return (
            <div role="alertdialog" aria-label="New match" className="menu-confirm flex flex-col gap-3 py-3 text-[13px]">
                <p className="m-0">{blockerText(blocker)}</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { stopBlocker(); void startNewMatch() }} className="btn-quiet btn-danger">Stop and switch</button>
                    <button type="button" onClick={() => setBlocker(null)} className="btn-quiet">Cancel</button>
                </div>
            </div>
        )
    }

    return (
        <div role="menu" aria-label="Menu" className="menu-list">
            <button type="button" role="menuitem" onClick={() => { const b = switchBlocker(); if (b) setBlocker(b); else void startNewMatch() }}>New match…</button>
            {hasFiles && (
                <button type="button" role="menuitem" onClick={() => openFindGoals()}>
                    {running ? `Find goals — ${running.percent}%` : hasSuggestions ? 'Review moments' : 'Find goals'} <AiTag />
                </button>
            )}
            {items.map(({ label, panel, aria }) => (
                <button key={panel} type="button" role="menuitem" aria-label={aria} onClick={() => useAppState.getState().openPanel(panel)}>{label}</button>
            ))}
            <button type="button" role="menuitem" onClick={() => useAppState.getState().openPanel('send')}>Send project to another device</button>
            <button type="button" role="menuitem" onClick={() => useAppState.getState().openPanel('import')}>Import…</button>
            <ProjectIO />
            <button type="button" role="menuitem" onClick={() => useAppState.getState().openPanel('shortcuts')}>Shortcuts</button>
            {(labs || labsSeen) && <button type="button" role="menuitem" onClick={() => { useAppState.getState().setLabs(!labs); useAppState.getState().closePanel() }}>{labs ? 'Labs: on' : 'Labs: off'}</button>}
        </div>
    )
}
