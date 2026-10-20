import { useRef, useState } from 'react'
import { useAppState, type Panel } from '../state'
import { PlaybackChoice } from './PlaybackChoice'
import { AiTag } from './AiTag'
import { useDetectJob } from '../detectJobs'
import { findGoalsProgress } from '../utils/findGoalsProgress'
import { openFindGoals, useSuggestionsCurrent } from './findGoals'
import { FloatingPanel } from './FloatingPanel'
import { ProjectIO } from './ProjectIO'
import { blockerText, startNewMatch, stopBlocker, switchBlocker, type SwitchBlocker } from './matchSwitch'
import { CopyDiagnostics } from './CopyDiagnostics'
import { playbackReportText } from '../playbackDiagnostics'
import type { Layout } from './useMediaQuery'
import { ExportPanel } from './ExportPanel'
import { useExportButtonStatus } from './useExportButtonStatus'
import { useTagUi } from './tagView'
import { getPlayerRate, runPlayerShortcut, setPlayerRate } from './playerControl'
import { useTagViewMode } from './tagView'

interface OverflowMenuProps {
    /** Desktop and tablet have a Match setup button in the bar; narrower layouts keep it in here. */
    layout?: Layout
    /** The touch player's ⋯ (top right over the picture): also holds the events list, Matches, Files, Export and fullscreen, and shows render progress. */
    tagView?: boolean
}

/** The top bar's ⋯: every secondary action in one place (desktop and phone). */
export function OverflowMenu({ layout = 'desktop', tagView = false }: OverflowMenuProps) {
    const open = useAppState((s) => s.panel === 'menu')
    const anchorRef = useRef<HTMLButtonElement | null>(null)
    const status = useExportButtonStatus()
    const rendering = tagView && status.kind === 'running'

    return (
        <>
            <button ref={anchorRef} type="button" aria-label={rendering ? `Menu, rendering ${status.percent}%` : 'Menu'} aria-haspopup="menu" aria-expanded={open}
                onClick={() => { const st = useAppState.getState(); if (open) st.closePanel(); else st.openPanel('menu') }}
                className={tagView ? 'control-btn tv-menu-btn' : 'top-btn top-btn--quiet top-btn--icon'}>
                <DotsIcon />
                {rendering && <span className="tv-menu-btn__live tc" aria-hidden="true"><i className="export-btn__dot" />{status.percent}%</span>}
            </button>
            {tagView && <span hidden><ExportPanel /></span> /* its drawer opens from the menu's Export item */}
            {open && (
                <FloatingPanel label="Menu" anchorRef={anchorRef} placement="below" className="floating--menu"
                    onClose={() => useAppState.getState().closePanel()}>
                    <MenuBody setupInMenu={layout !== 'desktop' && layout !== 'tablet'} tagView={tagView} />
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

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]

type MenuItem = { label: string; panel: Panel; aria?: string }

interface MenuBodyProps {
    setupInMenu: boolean
    tagView?: boolean
}

function MenuBody({ setupInMenu, tagView = false }: MenuBodyProps) {
    const anySuggestions = useAppState((s) => s.suggestions.length > 0)
    const suggestionsCurrent = useSuggestionsCurrent()
    const running = findGoalsProgress(useDetectJob((j) => j))
    const hasSuggestions = anySuggestions && suggestionsCurrent
    const hasFiles = useAppState((s) => s.files.length > 0)
    const labs = useAppState((s) => s.labs)
    const labsSeen = useAppState((s) => s.labsSeen)
    const [blocker, setBlocker] = useState<SwitchBlocker>(null)
    const fullscreen = useAppState((s) => s.playerFullscreen || s.immersive)
    const touchView = useTagViewMode() !== 'off'
    const [rate, setRate] = useState(getPlayerRate)
    const filesCount = useAppState((s) => s.files.length)
    const items: MenuItem[] = [
        ...(setupInMenu ? [{ label: 'Match setup', panel: 'match' as const }] : []),
        { label: 'Advanced settings', panel: 'settings' },
    ]

    if (blocker) {
        return (
            <div role="alertdialog" aria-label="New match" className="menu-confirm flex flex-col gap-3 py-3 text-ui-md">
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
            {touchView && hasFiles && (
                <div role="group" aria-label="Playback speed" className="menu-speeds">
                    <span className="menu-speeds__label">Speed</span>
                    {SPEEDS.map((r) => (
                        <button key={r} type="button" className="menu-speeds__btn tc" aria-pressed={Math.abs(rate - r) < 0.01} onClick={() => { setPlayerRate(r); setRate(r) }}>{r}×</button>
                    ))}
                </div>
            )}
            {hasFiles && <PlaybackChoice variant="menu" />}
            {tagView && (
                <>
                    <button type="button" role="menuitem" onClick={() => { useAppState.getState().closePanel(); useTagUi.getState().setSheet('events') }}>Events list</button>
                    <button type="button" role="menuitem" onClick={() => { useAppState.getState().closePanel(); useTagUi.getState().setSheet('matches') }}>Matches</button>
                    <button type="button" role="menuitem" onClick={() => useAppState.getState().openPanel('export')}>Export</button>
                    <button type="button" role="menuitem" onClick={() => useAppState.getState().openPanel('files')}>Files{filesCount > 0 ? ` (${filesCount})` : ''}</button>
                    <button type="button" role="menuitem" onClick={() => { useAppState.getState().closePanel(); runPlayerShortcut('fullscreen') }}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
                </>
            )}
            {setupInMenu && ( // desktop and tablet have New match in the top bar
                <button type="button" role="menuitem" onClick={() => { const b = switchBlocker(); if (b) setBlocker(b); else void startNewMatch() }}>New match…</button>
            )}
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
            <div className="menu-diag"><CopyDiagnostics getText={playbackReportText} label="Copy playback diagnostics" ariaLabel="Playback diagnostics" /></div>
            {(labs || labsSeen) && <button type="button" role="menuitem" onClick={() => { useAppState.getState().setLabs(!labs); useAppState.getState().closePanel() }}>{labs ? 'Labs: on' : 'Labs: off'}</button>}
        </div>
    )
}
