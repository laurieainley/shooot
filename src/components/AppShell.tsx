import { useEffect } from 'react'
import { selectClockLong, useAppState } from '../state'
import { clockWidthCh } from '../utils/timeline'
import { shortcutFor, shouldHandleShortcut } from '../utils/shortcuts'
import { EmptyPlayer } from './EmptyPlayer'
import { EventLog } from './EventLog'
import { Fab } from './Fab'
import { TagControls } from './TagControls'
import { FindGoalsChip, FindGoalsLine } from './FindGoalsChip'
import { useTagViewMode } from './tagView'
import { MatchList } from './MatchList'
import { RailTabs } from './RailTabs'
import { useRailTab } from './railTab'
import { MatchStrip } from './MatchStrip'
import { Panels } from './Panels'
import { Toast } from './Toast'
import { Player } from './Player'
import { PreviewControls } from './PreviewControls'
import { Chevron, TopBar } from './TopBar'
import { useKeyboardInset } from './useKeyboardInset'
import { usePanelSlot } from './panelSlot'
import { useLayout } from './useMediaQuery'
import { RenderChip } from './RenderChip'
import { useWakeLock } from './useWakeLock'
import { useRenderJobs } from '../renderJobs'
import { useDetectJob } from '../detectJobs'
import { useLeaveWarning } from './useLeaveWarning'
import { useMatchAutosave } from './useMatchAutosave'
import { useCrashBreadcrumbs } from './useCrashBreadcrumbs'
import { CrashNotice } from './CrashNotice'

/**
 * Edit bay. Desktop (≥ 900px): one screen, no page scroll — player and match strip on the left, the event
 * rail on the right. Landscape phone (short viewport): the same side-by-side bay under a
 * compact top bar, with the ＋ in the rail so it never covers the video controls. Portrait phone: stacked,
 * the event list scrolls with the page, ＋ floats bottom-right.
 */
export function AppShell() {
    const layout = useLayout()
    const railTab = useRailTab()
    const setSlot = usePanelSlot((s) => s.setEl)
    useKeyboardInset()
    const hasFiles = useAppState((s) => s.files.length > 0)
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const fullscreen = useAppState((s) => s.playerFullscreen || s.immersive) // the player shows its own toast then
    const sideBySide = layout === 'desktop' || layout === 'landscape'
    const tagViewMode = useTagViewMode()
    const overlay = tagViewMode === 'overlay' // the touch view: picture full screen, controls over it, no top bar or rail
    const collapsed = useAppState((s) => s.barCollapsed) && layout === 'landscape' && !overlay
    // Running times have one fixed width per project: the CSS variables size every clock (.clock) and video.js' own times.
    const clockLong = useAppState(selectClockLong)
    useEffect(() => {
        const root = document.documentElement.style
        root.setProperty('--clock-w', `${clockWidthCh(clockLong, true)}ch`)
        root.setProperty('--clock-w-file', `${clockWidthCh(clockLong, false)}ch`)
    }, [clockLong])
    // ? opens the Shortcuts sheet (everything else is handled by the Player once a file is loaded).
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.defaultPrevented || shortcutFor(e) !== 'shortcuts') return
            const st = useAppState.getState()
            if (!shouldHandleShortcut(e.target, { modalOpen: !!(st.picker || st.panel) })) return
            e.preventDefault()
            st.openPanel('shortcuts')
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])
    // A render keeps the screen on for its whole life (not just while the Export panel is open)…
    const rendering = useRenderJobs((s) => s.job?.phase === 'running')
    useWakeLock(rendering)
    // …and leaving the page asks first while a render or Find goals is running (a full match can resume; a reel or a Find
    // goals run would start again).
    const detecting = useDetectJob((s) => s.phase === 'running' || s.ballPhase === 'running')
    useLeaveWarning(rendering || detecting)
    useMatchAutosave()
    useCrashBreadcrumbs()

    // Side by side: the preview bar floats over the top of the picture. Portrait phone: it sits below the video.
    const stage = (
        <div className="stage">
            {hasFiles ? <Player /> : <EmptyPlayer />}
            {sideBySide && isPreviewMode && <div className="preview-bar"><PreviewControls /></div>}
            {collapsed && <RenderChip variant="overlay" />}
            {sideBySide && !fullscreen && !overlay && <div className="toast-host toast-host--video"><Toast /></div>}
        </div>
    )

    // One tree for every layout (CSS arranges it): the player must never remount when the phone is turned or the
    // window is resized, or the browser drops fullscreen with the removed element. Phone / tablet: the wrappers
    // below are `display: contents`, so the stage, strip and log are laid out as one column.
    const showFab = tagViewMode === 'off' && layout !== 'desktop' // a narrow window with a mouse; touch has the Tag button in the touch view
    return (
        <div className={`shell shell--${layout}${collapsed ? ' shell--bar-collapsed' : ''}${overlay ? ' shell--tagview' : ''}`}>
            {overlay ? null : collapsed ? (
                <button type="button" aria-label="Show top bar" title="Score, Export and menu" className="bar-handle"
                    onClick={() => useAppState.getState().setBarCollapsed(false)}>
                    <Chevron />
                </button>
            ) : <TopBar layout={layout} />}
            <main className={sideBySide ? 'bay' : 'stack'}>
                <div className="bay__left">
                    {stage}
                    {!sideBySide && !fullscreen && !overlay && <div className="toast-host toast-host--under"><Toast /></div>}
                    {!sideBySide && isPreviewMode && <div className="preview-bar preview-bar--inline"><PreviewControls /></div>}
                    {!overlay && <MatchStrip />}
                    {tagViewMode === 'band' && <FindGoalsLine />}
                    {tagViewMode === 'band' && <div className="tv-band"><div className="tv-band__chips"><FindGoalsChip /></div><TagControls variant="band" /></div>}
                </div>
                <aside className="rail" aria-label={sideBySide ? 'Event rail' : undefined}>
                    <div className="rail__main">
                        <RailTabs />
                        {railTab === 'events' ? <EventLog /> : <MatchList showNew={layout === 'phone' || layout === 'landscape'} />}
                    </div>
                    {showFab && railTab === 'events' && <Fab />}
                    <div ref={setSlot} className="panel-slot" />
                </aside>
            </main>
            <Panels />
            <CrashNotice />
        </div>
    )
}
