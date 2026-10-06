import { useEffect } from 'react'
import { useAppState } from '../state'
import { ClipSummary } from './ClipSummary'
import { EmptyPlayer } from './EmptyPlayer'
import { EventLog } from './EventLog'
import { Fab } from './Fab'
import { KeyHints } from './KeyHints'
import { MatchStrip } from './MatchStrip'
import { Panels } from './Panels'
import { Player } from './Player'
import { PreviewControls } from './PreviewControls'
import { Chevron, TopBar } from './TopBar'
import { useKeyboardInset } from './useKeyboardInset'
import { usePanelSlot } from './panelSlot'
import { COARSE_QUERY, useLayout, useMediaQuery } from './useMediaQuery'
import { RenderChip } from './RenderChip'
import { useWakeLock } from './useWakeLock'
import { useRenderJobs } from '../renderJobs'

/**
 * Edit bay. Desktop (≥ 900px): one screen, no page scroll — player and match strip on the left, the event
 * rail on the right, key hints below. Landscape phone (short viewport): the same side-by-side bay under a
 * compact top bar, with the ＋ in the rail so it never covers the video controls. Portrait phone: stacked,
 * the event list scrolls with the page, ＋ floats bottom-right.
 */
export function AppShell() {
    const layout = useLayout()
    const setSlot = usePanelSlot((s) => s.setEl)
    useKeyboardInset()
    const hasFiles = useAppState((s) => s.files.length > 0)
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const coarse = useMediaQuery(COARSE_QUERY)
    const sideBySide = layout === 'desktop' || layout === 'landscape'
    const collapsed = useAppState((s) => s.barCollapsed) && layout === 'landscape'
    // A render keeps the screen on for its whole life (not just while the Export panel is open)…
    const rendering = useRenderJobs((s) => s.job?.phase === 'running')
    useWakeLock(rendering)
    // …and leaving the page asks first (a full match can resume, but a reel would start again).
    useEffect(() => {
        if (!rendering) return
        const warn = (e: BeforeUnloadEvent): void => { e.preventDefault() }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [rendering])

    // Side by side: the preview bar floats over the top of the picture. Portrait phone: it sits below the video.
    const stage = (
        <div className="stage">
            {hasFiles ? <Player /> : <EmptyPlayer />}
            {sideBySide && isPreviewMode && <div className="preview-bar"><PreviewControls /></div>}
            {collapsed && <RenderChip variant="overlay" />}
        </div>
    )

    // One tree for every layout (CSS arranges it): the player must never remount when the phone is turned or the
    // window is resized, or the browser drops fullscreen with the removed element. Phone / tablet: the wrappers
    // below are `display: contents`, so the stage, strip and log are laid out as one column.
    const showFab = layout !== 'desktop' || coarse
    return (
        <div className={`shell shell--${layout}${collapsed ? ' shell--bar-collapsed' : ''}`}>
            {collapsed ? (
                <button type="button" aria-label="Show top bar" title="Score, Export and menu" className="bar-handle"
                    onClick={() => useAppState.getState().setBarCollapsed(false)}>
                    <Chevron />
                </button>
            ) : <TopBar layout={layout} />}
            <main className={sideBySide ? 'bay' : 'stack'}>
                <div className="bay__left">
                    {stage}
                    {!sideBySide && isPreviewMode && <div className="preview-bar preview-bar--inline"><PreviewControls /></div>}
                    <MatchStrip />
                </div>
                <aside className="rail" aria-label={sideBySide ? 'Event rail' : undefined}>
                    <EventLog />
                    <ClipSummary compact={layout !== 'phone' && (layout !== 'desktop' || coarse)} />
                    {showFab && <Fab />}
                    <div ref={setSlot} className="panel-slot" />
                </aside>
            </main>
            {layout === 'desktop' && !coarse && <KeyHints />}
            <Panels />
        </div>
    )
}
