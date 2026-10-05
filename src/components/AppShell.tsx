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
import { useLayout } from './useMediaQuery'

/**
 * Edit bay. Desktop (≥ 900px): one screen, no page scroll — player and match strip on the left, the event
 * rail on the right, key hints below. Landscape phone (short viewport): the same side-by-side bay under a
 * compact top bar, with the ＋ in the rail so it never covers the video controls. Portrait phone: stacked,
 * the event list scrolls with the page, ＋ floats bottom-right.
 */
export function AppShell() {
    const layout = useLayout()
    const hasFiles = useAppState((s) => s.files.length > 0)
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const sideBySide = layout !== 'phone'
    const collapsed = useAppState((s) => s.barCollapsed) && layout === 'landscape'

    // Side by side: the preview bar floats over the top of the picture. Portrait phone: it sits below the video.
    const stage = (
        <div className="stage">
            {hasFiles ? <Player /> : <EmptyPlayer />}
            {sideBySide && isPreviewMode && <div className="preview-bar"><PreviewControls /></div>}
        </div>
    )

    return (
        <div className={`shell shell--${layout}${collapsed ? ' shell--bar-collapsed' : ''}`}>
            {collapsed ? (
                <button type="button" aria-label="Show top bar" title="Score, Export and menu" className="bar-handle"
                    onClick={() => useAppState.getState().setBarCollapsed(false)}>
                    <Chevron />
                </button>
            ) : <TopBar layout={layout} />}
            {sideBySide ? (
                <>
                    <main className="bay">
                        <div className="bay__left">
                            {stage}
                            <MatchStrip />
                        </div>
                        <aside className="rail" aria-label="Event rail">
                            <EventLog />
                            <ClipSummary compact={layout === 'landscape'} />
                            {layout === 'landscape' && <Fab />}
                        </aside>
                    </main>
                    {layout === 'desktop' && <KeyHints />}
                </>
            ) : (
                <main className="stack">
                    {stage}
                    {isPreviewMode && <div className="preview-bar preview-bar--inline"><PreviewControls /></div>}
                    <MatchStrip />
                    <EventLog />
                    <ClipSummary />
                    <Fab />
                </main>
            )}
            <Panels />
        </div>
    )
}
