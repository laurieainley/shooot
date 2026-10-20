import { useMemo, type ReactNode } from 'react'
import { useAppState } from '../state'
import { globalToFileTime } from '../utils/matchStrip'
import { jumpStartSec, nextMoment, pendingMoments, prevMoment } from '../utils/tagView'
import type { Suggestion } from '../types'
import { useSuggestionsCurrent } from './findGoals'
import { runPlayerShortcut, stepPlayer, togglePlayerPlayback, usePlayerPaused } from './playerControl'
import { startTag, useTagUi } from './tagView'

interface TagControlsProps {
    /** overlay: floating over the picture (fades while playing); band: in the page under the picture. */
    variant: 'overlay' | 'band'
}

/** Seeks to 6 s before a found moment and plays (no replay loop: ⟲5 replays). */
function jumpTo(moment: Suggestion): void {
    const st = useAppState.getState()
    const durations = st.files.map((f) => f.durationSec ?? 0)
    const at = globalToFileTime(st.cumulativeOffsets, durations, jumpStartSec(moment))
    st.seekToGoal(at.fileIndex, Math.round(at.timeSec * 10) / 10)
}

/**
 * The thumb controls of the touch player: left thumb moves around (⟲5 · Play · ⟳5, frame ‹ ›, found moments ◀ ▶, most used
 * lowest), right thumb acts (Tag). One component for the overlay and the band under the picture.
 */
export function TagControls({ variant }: TagControlsProps) {
    const paused = usePlayerPaused()
    const tagging = useAppState((s) => s.picker !== null)
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const current = useSuggestionsCurrent()
    const absNow = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const reviewOpen = useAppState((s) => s.panel === 'review')
    const moments = useMemo(() => (current ? pendingMoments(suggestions, new Set(events.map((e) => e.id))) : []), [suggestions, events, current])
    const prev = prevMoment(moments, absNow)
    const next = nextMoment(moments, absNow)
    const poke = useTagUi((s) => s.poke)
    const fades = variant === 'overlay' ? ' tv-fades' : ''

    return (
        <>
            <div className={`tv-left${fades}`} role="group" aria-label="Move around" onPointerDown={poke}>
                <div className="tv-found-row">
                    <TvButton label="Previous found moment" className="tv-btn--found" disabled={!prev || tagging} onClick={() => prev && jumpTo(prev)}><span aria-hidden="true">◀ Found</span></TvButton>
                    <TvButton label="Next found moment" className="tv-btn--found" disabled={!next || tagging} onClick={() => next && jumpTo(next)}><span aria-hidden="true">Found ▶</span></TvButton>
                </div>
                <TvButton label="Previous frame" onClick={() => stepPlayer('frame', -1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></TvButton>
                <span />
                <TvButton label="Next frame" onClick={() => stepPlayer('frame', 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></TvButton>
                <TvButton label="Back 5 seconds" onClick={() => runPlayerShortcut('seekBack')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></svg>
                </TvButton>
                <TvButton label={paused ? 'Play' : 'Pause'} className="tv-btn--play" onClick={togglePlayerPlayback}>
                    {paused
                        ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
                        : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
                </TvButton>
                <TvButton label="Forward 5 seconds" onClick={() => runPlayerShortcut('seekForward')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4h-4" /></svg>
                </TvButton>
            </div>
            {!tagging && !(variant === 'overlay' && reviewOpen) && (
                <div className={`tv-right${fades}`} onPointerDown={poke}>
                    <button type="button" className="btn-primary tv-tag" aria-label="Tag this moment" onClick={startTag}>Tag</button>
                </div>
            )}
        </>
    )
}

interface TvButtonProps {
    label: string
    onClick: () => void
    disabled?: boolean
    className?: string
    children: ReactNode
}

function TvButton({ label, onClick, disabled = false, className = '', children }: TvButtonProps) {
    return <button type="button" className={`tv-btn ${className}`} aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>
}
