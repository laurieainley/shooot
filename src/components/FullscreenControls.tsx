import { useEffect, useRef, useState } from 'react'
import { DOUBLE_TAP_MS, NO_TAPS, resolveTap, type Tap, type TapMemory, type TapZone } from '../utils/tap'
import { Fab } from './Fab'
import { ScoreBadge } from './ScoreBadge'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

type OverlayPlayer = {
    paused: () => boolean
    play: () => unknown
    pause: () => unknown
    currentTime: (t?: number) => number
    playbackRate: (r?: number) => number
    userActive?: (active: boolean) => unknown
    requestFullscreen?: () => unknown
    exitFullscreen?: () => unknown
}

interface FullscreenControlsProps {
    playerRef: React.MutableRefObject<OverlayPlayer | null>
    isFullscreen: boolean
}

const SEEK_SEC = 5

/**
 * Touch layer over the picture (touch screens, and fullscreen everywhere): a single tap toggles playback,
 * a double tap on the left / right third seeks −5 s / +5 s. Fullscreen adds speed buttons and the ＋ mark button.
 */
export function FullscreenControls({ playerRef, isFullscreen }: FullscreenControlsProps) {
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [tapFeedback, setTapFeedback] = useState<{ side: 'left' | 'right'; timestamp: number } | null>(null)
    const tapsRef = useRef<TapMemory>(NO_TAPS)
    const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const coarse = useMediaQuery(COARSE_QUERY)

    useEffect(() => {
        if (playerRef.current) setPlaybackSpeed(playerRef.current.playbackRate())
    }, [playerRef])

    useEffect(() => () => {
        if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current)
    }, [])

    const togglePlay = (): void => {
        const player = playerRef.current
        if (!player) return
        if (player.paused()) player.play()
        else player.pause()
    }

    const handleTap = (zone: TapZone): void => {
        const player = playerRef.current
        player?.userActive?.(true) // our layer swallows the tap, so show the control bar ourselves
        const tap: Tap = { time: Date.now(), zone }
        if (singleTapTimerRef.current) {
            clearTimeout(singleTapTimerRef.current)
            singleTapTimerRef.current = null
        }
        const { memory, action } = resolveTap(tapsRef.current, tap)
        tapsRef.current = memory
        if (action === 'ignore') return
        if (action === 'seek') {
            if (player) {
                const t = player.currentTime() || 0
                player.currentTime(zone === 'left' ? Math.max(0, t - SEEK_SEC) : t + SEEK_SEC)
                setTapFeedback({ side: zone as 'left' | 'right', timestamp: tap.time })
                setTimeout(() => setTapFeedback(null), 500)
            }
            return
        }
        if (action === 'toggle') { togglePlay(); return } // no double tap in the centre, so no need to wait
        singleTapTimerRef.current = setTimeout(() => {
            singleTapTimerRef.current = null
            togglePlay()
        }, DOUBLE_TAP_MS)
    }

    const setRate = (rate: number): void => {
        if (!playerRef.current) return
        playerRef.current.playbackRate(rate)
        setPlaybackSpeed(rate)
    }
    const currentRate = (): number => playerRef.current?.playbackRate() ?? 1

    if (!isFullscreen && !coarse) return null

    return (
        <div className={`fullscreen-overlay ${isFullscreen ? 'fullscreen-overlay--fullscreen' : 'fullscreen-overlay--normal'}`}>
            <div className="tap-zone tap-zone-left" onClick={() => handleTap('left')}>
                {tapFeedback?.side === 'left' && <SeekFeedback side="left" />}
            </div>
            <div className="tap-zone tap-zone-centre" onClick={() => handleTap('centre')} />
            <div className="tap-zone tap-zone-right" onClick={() => handleTap('right')}>
                {tapFeedback?.side === 'right' && <SeekFeedback side="right" />}
            </div>

            {/* Touch: our own button, always visible and hittable (the control bar's is hidden before the first
                play and swallows the first tap while idle). Enters synchronously inside the tap gesture. */}
            {coarse && !isFullscreen && (
                <div className="overlay-controls top-right">
                    <button type="button" aria-label="Fullscreen" className="control-btn fs-btn" onClick={() => playerRef.current?.requestFullscreen?.()}>
                        <FsIcon />
                    </button>
                </div>
            )}

            {isFullscreen && (
                <>
                    <div className="overlay-controls top-left score-chip"><ScoreBadge compact /></div>
                    <div className="overlay-controls top-right">
                        <button type="button" aria-label="Slower" className="control-btn speed-btn" onClick={() => setRate(Math.max(0.25, currentRate() - 0.25))}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 19l-7-7 7-7" /></svg>
                        </button>
                        <button type="button" aria-label="Normal speed" className="control-btn speed-btn speed-display" onClick={() => setRate(1)}>
                            {playbackSpeed.toFixed(2)}x
                        </button>
                        <button type="button" aria-label="Faster" className="control-btn speed-btn" onClick={() => setRate(Math.min(4, currentRate() + 0.25))}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 5l7 7-7 7" /></svg>
                        </button>
                        {coarse && (
                            <button type="button" aria-label="Exit fullscreen" className="control-btn fs-btn" onClick={() => playerRef.current?.exitFullscreen?.()}>
                                <FsIcon exit />
                            </button>
                        )}
                    </div>
                    <Fab />
                </>
            )}
        </div>
    )
}

interface SeekFeedbackProps {
    side: 'left' | 'right'
}

function SeekFeedback({ side }: SeekFeedbackProps) {
    return (
        <div className="tap-feedback">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d={side === 'left' ? 'M19 12H5M12 19l-7-7 7-7' : 'M5 12h14M12 5l7 7-7 7'} />
            </svg>
            <div className="tap-feedback-text">{side === 'left' ? `-${SEEK_SEC}s` : `+${SEEK_SEC}s`}</div>
        </div>
    )
}

interface FsIconProps {
    exit?: boolean
}

function FsIcon({ exit = false }: FsIconProps) {
    const d = exit
        ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
        : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
}
