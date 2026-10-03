import { useState } from 'react'
import { useAppState } from '../state'
import { ClipSummary } from './ClipSummary'
import { EmptyPlayer } from './EmptyPlayer'
import { EventLog } from './EventLog'
import { Fab } from './Fab'
import { KeyHints } from './KeyHints'
import { MatchSetup } from './MatchSetup'
import { MatchStrip } from './MatchStrip'
import { Player } from './Player'
import { PreviewControls } from './PreviewControls'
import { TopBar } from './TopBar'
import { DESKTOP_QUERY, useMediaQuery } from './useMediaQuery'

/**
 * Edit bay. Desktop (≥ 900px): one screen, no page scroll — player and match strip on the left, the event
 * rail on the right, key hints below. Phone: stacked, the event list scrolls with the page, ＋ marks.
 */
export function AppShell() {
    const desktop = useMediaQuery(DESKTOP_QUERY)
    const hasFiles = useAppState((s) => s.files.length > 0)
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const [showMatch, setShowMatch] = useState(false)

    const stage = (
        <div className="stage">
            {hasFiles ? <Player /> : <EmptyPlayer />}
            {isPreviewMode && <div className="preview-bar"><PreviewControls /></div>}
        </div>
    )

    return (
        <div className={desktop ? 'shell shell--desktop' : 'shell shell--phone'}>
            <TopBar desktop={desktop} onOpenMatch={() => setShowMatch(true)} />
            {desktop ? (
                <>
                    <main className="bay">
                        <div className="bay__left">
                            {stage}
                            <MatchStrip />
                        </div>
                        <aside className="rail" aria-label="Event rail">
                            <EventLog />
                            <ClipSummary />
                        </aside>
                    </main>
                    <KeyHints />
                </>
            ) : (
                <main className="stack">
                    {stage}
                    <MatchStrip />
                    <EventLog />
                    <ClipSummary />
                    <Fab />
                </main>
            )}
            {showMatch && <MatchSetup onClose={() => setShowMatch(false)} />}
        </div>
    )
}
