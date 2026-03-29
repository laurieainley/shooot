import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import type { Goal } from '../types'

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
    const [showAddGoalModal, setShowAddGoalModal] = useState(false)
    const [teamName, setTeamName] = useState('')
    const [playerName, setPlayerName] = useState('')
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [tapFeedback, setTapFeedback] = useState<{ side: 'left' | 'right'; timestamp: number } | null>(null)

    const addGoal = useAppState((s) => s.addGoal)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)

    const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const isMobile = useIsMobile()

    useEffect(() => {
        if (playerRef.current) {
            const rate = playerRef.current.playbackRate()
            setPlaybackSpeed(rate)
        }
    }, [playerRef])

    // Handle double-tap for seeking
    const handleTap = (side: 'left' | 'right') => {
        const now = Date.now()
        const lastTap = lastTapRef.current

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
        setShowAddGoalModal(true)
    }

    const handleSubmitGoal = () => {
        if (playerRef.current) {
            const currentTimeSeconds = Math.floor(playerRef.current.currentTime() || 0)
            const goal: Goal = {
                id: `${Date.now()}`,
                matchTimeSec: currentTimeSeconds,
                sourceFileIndex: currentFileIndex,
                team: teamName || undefined,
                scorer: playerName || undefined
            }
            addGoal(goal)

            // Clear form and close modal
            setTeamName('')
            setPlayerName('')
            setShowAddGoalModal(false)
        }
    }

    const handleCancelGoal = () => {
        setTeamName('')
        setPlayerName('')
        setShowAddGoalModal(false)
    }

    // Desktop non-fullscreen: hide overlay entirely
    if (!isFullscreen && !isMobile) {
        return null
    }

    // Mobile non-fullscreen: show tap zones + centered goal button only
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

            {/* Goal button — centered between tap zones on mobile, top-left in fullscreen */}
            <div className={isFullscreen ? 'overlay-controls top-left' : 'overlay-controls center-top'}>
                <button className="control-btn add-goal-btn" onClick={handleAddGoal}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v8M8 12h8" />
                    </svg>
                    <span>Goal</span>
                </button>
            </div>

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

            {/* Add Goal Modal */}
            {showAddGoalModal && (
                <div className="goal-modal-overlay" onClick={handleCancelGoal}>
                    <div className="goal-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Add Goal</h3>
                        <div className="goal-modal-field">
                            <label htmlFor="team-name">Team</label>
                            <input
                                id="team-name"
                                type="text"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                placeholder="Team name"
                                autoFocus
                            />
                        </div>
                        <div className="goal-modal-field">
                            <label htmlFor="player-name">Scorer</label>
                            <input
                                id="player-name"
                                type="text"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                placeholder="Player name"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSubmitGoal()
                                    }
                                }}
                            />
                        </div>
                        <div className="goal-modal-actions">
                            <button className="modal-btn modal-btn-cancel" onClick={handleCancelGoal}>
                                Cancel
                            </button>
                            <button className="modal-btn modal-btn-submit" onClick={handleSubmitGoal}>
                                Add Goal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
