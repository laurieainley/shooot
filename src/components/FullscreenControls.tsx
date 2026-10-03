import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'

interface FullscreenControlsProps {
    playerRef: React.MutableRefObject<any>
    isFullscreen: boolean
}

function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(
        () => window.matchMedia('(max-width: 768px)').matches
    )
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)')
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])
    return isMobile
}

export function FullscreenControls({ playerRef, isFullscreen }: FullscreenControlsProps) {
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [tapFeedback, setTapFeedback] = useState<{ side: 'left' | 'right'; timestamp: number } | null>(null)

    const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null)
    const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const isMobile = useIsMobile()

    useEffect(() => {
        if (playerRef.current) {
            const rate = playerRef.current.playbackRate()
            setPlaybackSpeed(rate)
        }
    }, [playerRef])

    useEffect(() => () => {
        if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current)
    }, [])

    // Single tap toggles play/pause (once the double-tap window has passed); double tap seeks
    const handleTap = (side: 'left' | 'right') => {
        const now = Date.now()
        const lastTap = lastTapRef.current

        if (singleTapTimerRef.current) {
            clearTimeout(singleTapTimerRef.current)
            singleTapTimerRef.current = null
        }

        if (lastTap && lastTap.side === side && now - lastTap.time < 300) {
            // Double tap detected
            if (playerRef.current) {
                const seekAmount = 5 // seconds
                const currentTime = playerRef.current.currentTime()
                const newTime = side === 'left'
                    ? Math.max(0, currentTime - seekAmount)
                    : currentTime + seekAmount
                playerRef.current.currentTime(newTime)

                // Show feedback
                setTapFeedback({ side, timestamp: now })
                setTimeout(() => setTapFeedback(null), 500)
            }
            lastTapRef.current = null
        } else {
            lastTapRef.current = { time: now, side }
            singleTapTimerRef.current = setTimeout(() => {
                singleTapTimerRef.current = null
                const player = playerRef.current
                if (!player) return
                if (player.paused()) player.play()
                else player.pause()
            }, 300)
        }
    }

    const handleSpeedDecrease = () => {
        if (playerRef.current) {
            const currentRate = playerRef.current.playbackRate()
            const newRate = Math.max(0.25, currentRate - 0.25)
            playerRef.current.playbackRate(newRate)
            setPlaybackSpeed(newRate)
        }
    }

    const handleSpeedReset = () => {
        if (playerRef.current) {
            playerRef.current.playbackRate(1)
            setPlaybackSpeed(1)
        }
    }

    const handleSpeedIncrease = () => {
        if (playerRef.current) {
            const currentRate = playerRef.current.playbackRate()
            const newRate = Math.min(4, currentRate + 0.25)
            playerRef.current.playbackRate(newRate)
            setPlaybackSpeed(newRate)
        }
    }

    const handleAddGoal = () => {
        const player = playerRef.current
        if (player) useAppState.getState().markEvent(player.currentTime() || 0)
    }

    // Desktop non-fullscreen: hide overlay entirely
    if (!isFullscreen && !isMobile) {
        return null
    }

    // Mobile non-fullscreen: tap zones only
    // Fullscreen: show everything (tap zones, goal button, speed controls)
    const showSpeedControls = isFullscreen

    return (
        <div
            ref={overlayRef}
            className={`fullscreen-overlay ${isFullscreen ? 'fullscreen-overlay--fullscreen' : 'fullscreen-overlay--normal'}`}
        >
            {/* Double-tap zones */}
            <div className="tap-zone tap-zone-left" onClick={() => handleTap('left')}>
                {tapFeedback?.side === 'left' && (
                    <div className="tap-feedback">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <div className="tap-feedback-text">-5s</div>
                    </div>
                )}
            </div>

            <div className="tap-zone tap-zone-right" onClick={() => handleTap('right')}>
                {tapFeedback?.side === 'right' && (
                    <div className="tap-feedback">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        <div className="tap-feedback-text">+5s</div>
                    </div>
                )}
            </div>

            {/* Event button — fullscreen only; outside fullscreen the phone layout's ＋ button marks events */}
            {isFullscreen && <div className="overlay-controls top-left">
                <button className="control-btn add-goal-btn" aria-label="Event" onClick={handleAddGoal}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v8M8 12h8" />
                    </svg>
                    <span>Event</span>
                </button>
            </div>}

            {/* Speed controls (fullscreen only) */}
            {showSpeedControls && (
                <div className="overlay-controls top-right">
                    <button className="control-btn speed-btn" onClick={handleSpeedDecrease}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button className="control-btn speed-btn speed-display" onClick={handleSpeedReset}>
                        {playbackSpeed.toFixed(2)}x
                    </button>
                    <button className="control-btn speed-btn" onClick={handleSpeedIncrease}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M13 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    )
}
