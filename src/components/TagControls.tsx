import { useMemo, type ReactNode } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import { nextMoment, pendingMoments, prevMoment } from '../utils/tagView'
import { matchClock } from '../utils/toastCopy'
import { momentChipText } from '../utils/foundMoments'
import { jumpToMoment, rejectMoment, useCurrentMoment } from './foundMoments'
import { useSuggestionsCurrent } from './findGoals'
import { runPlayerShortcut, stepPlayer, togglePlayerPlayback, usePlayerPaused } from './playerControl'
import { SpeedButton } from './SpeedButton'
import { startTag, useTagUi } from './tagView'

interface TagControlsProps {
    /**
     * overlay: everything floating over the picture (landscape / fullscreen);
     * portrait: the transport row and Tag over the bottom edge of the picture (upright phone / tablet);
     * band: the slim row under the picture in portrait - Found ◀ ▶, the found-moment chip and Not a goal (`children` = the Find goals chip).
     */
    variant: 'overlay' | 'portrait' | 'band'
    children?: ReactNode
}

/**
 * The thumb controls of the touch player: left thumb moves around (⟲5 · Play · ⟳5, frame ‹ ›, found moments ◀ ▶, most used
 * lowest), right thumb acts (Tag). One component for the overlay, the portrait row over the picture and the band under it.
 */
export function TagControls({ variant, children }: TagControlsProps) {
    const paused = usePlayerPaused()
    const tagging = useAppState((s) => s.picker !== null)
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const current = useSuggestionsCurrent()
    const absNow = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const onMoment = useCurrentMoment()
    const kick = useAppState(selectMatchStartSec)
    const long = useAppState(selectClockLong)
    const moments = useMemo(() => (current ? pendingMoments(suggestions, new Set(events.map((e) => e.id))) : []), [suggestions, events, current])
    const prev = prevMoment(moments, absNow)
    const next = nextMoment(moments, absNow)
    const poke = useTagUi((s) => s.poke)
    const fades = variant === 'band' ? '' : ' tv-fades'

    const back5 = <TvButton label="Back 5 seconds" onClick={() => runPlayerShortcut('seekBack')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></svg>
    </TvButton>
    const play = <TvButton label={paused ? 'Play' : 'Pause'} className="tv-btn--play" onClick={togglePlayerPlayback}>
        {paused
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
    </TvButton>
    const forward5 = <TvButton label="Forward 5 seconds" onClick={() => runPlayerShortcut('seekForward')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4h-4" /></svg>
    </TvButton>
    const prevFrame = <TvButton label="Previous frame" className="tv-btn--frame" onClick={() => stepPlayer('frame', -1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></TvButton>
    const nextFrame = <TvButton label="Next frame" className="tv-btn--frame" onClick={() => stepPlayer('frame', 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></TvButton>

    if (variant === 'portrait') {
        // One compact row over the bottom edge of the picture: transport on the left, Tag at the bottom right. The found-moment
        // buttons, chip and Not a goal live in the band under the picture (the picture is only ~200 px tall).
        return (
            <div className="tv-dock tv-fades" onPointerDown={poke}>
                <div className="tv-left" role="group" aria-label="Move around">
                    {back5}{play}{forward5}{prevFrame}{nextFrame}<SpeedButton variant="touch" />
                </div>
                {!tagging && <button type="button" className="btn-primary tv-tag" aria-label="Tag this moment" onClick={startTag}>Tag</button>}
            </div>
        )
    }

    if (variant === 'band') {
        const showFound = moments.length > 0 && !tagging
        return (
            <>
                <div className="tv-band__row">
                    {showFound && <TvButton label="Previous found moment" className="tv-btn--found" disabled={!prev} onClick={() => prev && jumpToMoment(prev)}><span aria-hidden="true">◀ Found</span></TvButton>}
                    {children}
                    {showFound && <TvButton label="Next found moment" className="tv-btn--found" disabled={!next} onClick={() => next && jumpToMoment(next)}><span aria-hidden="true">Found ▶</span></TvButton>}
                </div>
                {onMoment && !tagging && (
                    <div className="tv-band__row tv-band__row--moment">
                        <div className={`tv-moment${onMoment.moment.ball ? ' tv-moment--top' : ''}`} role="status" aria-label={momentChipText(onMoment.moment, onMoment, matchClock(onMoment.moment.globalTimeSec, kick, long))}>
                            <span className="tv-moment__kind">{onMoment.moment.ball ? <><span className="tv-moment__star" aria-hidden="true">★</span> Top pick</> : 'Found moment'}</span>
                            <span className="tv-moment__meta">{onMoment.index} of {onMoment.total} · <span className="tc">{matchClock(onMoment.moment.globalTimeSec, kick, long)}</span></span>
                        </div>
                        <button type="button" className="tv-notgoal" onClick={() => rejectMoment(onMoment.moment)}><span aria-hidden="true">✕ </span>Not a goal</button>
                    </div>
                )}
            </>
        )
    }

    return (
        <>
            <div className={`tv-left${fades}`} role="group" aria-label="Move around" onPointerDown={poke}>
                <div className="tv-found-row">
                    <TvButton label="Previous found moment" className="tv-btn--found" disabled={!prev || tagging} onClick={() => prev && jumpToMoment(prev)}><span aria-hidden="true">◀ Found</span></TvButton>
                    <TvButton label="Next found moment" className="tv-btn--found" disabled={!next || tagging} onClick={() => next && jumpToMoment(next)}><span aria-hidden="true">Found ▶</span></TvButton>
                </div>
                {prevFrame}
                <SpeedButton variant="touch" />
                {nextFrame}
                {back5}
                {play}
                {forward5}
            </div>
            {onMoment && !tagging && (
                <div className={`tv-moment${fades}${onMoment.moment.ball ? ' tv-moment--top' : ''}`} role="status" aria-label={momentChipText(onMoment.moment, onMoment, matchClock(onMoment.moment.globalTimeSec, kick, long))}>
                    <span className="tv-moment__kind">{onMoment.moment.ball ? <><span className="tv-moment__star" aria-hidden="true">★</span> Top pick</> : 'Found moment'}</span>
                    <span className="tv-moment__meta">{onMoment.index} of {onMoment.total} · <span className="tc">{matchClock(onMoment.moment.globalTimeSec, kick, long)}</span></span>
                </div>
            )}
            {!tagging && (
                <div className={`tv-right${fades}`} onPointerDown={poke}>
                    <button type="button" className="btn-primary tv-tag" aria-label="Tag this moment" onClick={startTag}>Tag</button>
                    {/* The slot is always there so Tag never moves when Not a goal appears (a moving target invites mis-taps). */}
                    {onMoment
                        ? <button type="button" className="tv-notgoal" onClick={() => rejectMoment(onMoment.moment)}><span aria-hidden="true">✕ </span>Not a goal</button>
                        : <span className="tv-notgoal tv-notgoal--slot" aria-hidden="true">✕ Not a goal</span>}
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
