import { useEffect, useRef, useState } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import 'videojs-hotkeys'
import { useAppState } from '../state'
import { formatHMS } from '../utils/timeline'
import { seekStepFor, frameStepTime, DEFAULT_FPS } from '../utils/hotkeys'
import { FullscreenControls } from './FullscreenControls'

type FrameStepPlayer = { pause: () => void; currentTime: (t?: number) => number; duration: () => number }

export function Player() {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const playerRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const files = useAppState((s) => s.files)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const setCurrentFileIndex = useAppState((s) => s.setCurrentFileIndex)
    const addGoal = useAppState((s) => s.addEvent)
    const [currentTime, setCurrentTime] = useState(0)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [speedIndicator, setSpeedIndicator] = useState<number | null>(null)
    const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const setCurrentTimeInFile = useAppState((s) => s.setCurrentTimeInFile)
    // Preview mode state
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewSegments = useAppState((s) => s.previewSegments)
    const currentPreviewSegment = useAppState((s) => s.currentPreviewSegment)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)

    useEffect(() => {
        if (!videoRef.current) return
        if (!playerRef.current) {
            playerRef.current = videojs(videoRef.current, {
                controls: !isPreviewMode, // Disable controls during preview
                autoplay: false,
                preload: 'auto',
                fluid: false,
                fill: true,
            })

            // Enable hotkeys once the player is ready
            playerRef.current.ready(() => {
                if (playerRef.current) {
                    (playerRef.current as any).hotkeys({
                        volumeStep: 0.1,
                        seekStep: seekStepFor,             // ←/→ 5 s, Shift+←/→ 1 s
                        volumeUpKey: () => false,          // ↑/↓ are frame steps (custom keys below)
                        volumeDownKey: () => false,
                        enableModifiersForNumbers: false,
                        enableVolumeScroll: false,
                        enableHoverScroll: false,
                        enableFullscreen: true,
                        alwaysCaptureHotkeys: true,
                        enableNumbers: false,              // 0–9 seek disabled (too easy to hit by accident)
                        customKeys: {
                            frameForward: {
                                key: (event: KeyboardEvent) => event.which === 38, // ↑
                                handler: (player: FrameStepPlayer) => {
                                    player.pause()
                                    player.currentTime(frameStepTime(player.currentTime() || 0, 1, DEFAULT_FPS, player.duration() || Infinity))
                                }
                            },
                            frameBack: {
                                key: (event: KeyboardEvent) => event.which === 40, // ↓
                                handler: (player: FrameStepPlayer) => {
                                    player.pause()
                                    player.currentTime(frameStepTime(player.currentTime() || 0, -1, DEFAULT_FPS, player.duration() || Infinity))
                                }
                            },
                            // Speed controls
                            decreaseSpeed: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 188 && !event.shiftKey; // comma (,)
                                },
                                handler: function (player: any) {
                                    const currentRate = player.playbackRate();
                                    const newRate = Math.max(0.25, currentRate - 0.25);
                                    player.playbackRate(newRate);
                                    console.log(`Playback speed: ${newRate}x`);
                                }
                            },
                            increaseSpeed: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 190 && !event.shiftKey; // period (.)
                                },
                                handler: function (player: any) {
                                    const currentRate = player.playbackRate();
                                    const newRate = Math.min(4, currentRate + 0.25);
                                    player.playbackRate(newRate);
                                    console.log(`Playback speed: ${newRate}x`);
                                }
                            },
                            // Home key - jump to start
                            jumpToStart: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 36; // Home key
                                },
                                handler: function (player: any) {
                                    player.currentTime(0);
                                }
                            },
                            // End key - jump to end
                            jumpToEnd: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 35; // End key
                                },
                                handler: function (player: any) {
                                    const duration = player.duration();
                                    if (duration) {
                                        player.currentTime(duration - 1); // 1 second before end
                                    }
                                }
                            },
                            // / key - reset speed to normal
                            resetSpeed: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 191 && !event.shiftKey; // forward slash (/)
                                },
                                handler: function (player: any) {
                                    player.playbackRate(1);
                                    console.log('Playback speed: 1x (normal)');
                                }
                            },
                            // G key - add goal at current time (M is video.js mute)
                            addGoal: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 71; // G
                                },
                                handler: function (player: any) {
                                    const currentTimeSeconds = Math.floor(player.currentTime() || 0);
                                    // Get the current file index from the store to avoid stale closure
                                    const currentIdx = useAppState.getState().currentFileIndex;
                                    addGoal({
                                        id: `${Date.now()}`,
                                        matchTimeSec: currentTimeSeconds,
                                        sourceFileIndex: currentIdx,
                                        type: 'goal',
                                    });
                                    console.log(`Goal added at ${currentTimeSeconds}s for Video ${currentIdx + 1}`);
                                }
                            },
                            // [ key - switch to previous video
                            prevVideo: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 219 || event.keyCode === 219; // [ key
                                },
                                handler: function () {
                                    const state = useAppState.getState();
                                    if (state.currentFileIndex > 0) {
                                        const newIndex = state.currentFileIndex - 1;
                                        state.setCurrentFileIndex(newIndex);
                                        console.log(`Switched to Video ${newIndex + 1}`);
                                    }
                                }
                            },
                            // ] key - switch to next video
                            nextVideo: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 221 || event.keyCode === 221; // ] key
                                },
                                handler: function () {
                                    const state = useAppState.getState();
                                    if (state.currentFileIndex < state.files.length - 1) {
                                        const newIndex = state.currentFileIndex + 1;
                                        state.setCurrentFileIndex(newIndex);
                                        console.log(`Switched to Video ${newIndex + 1}`);
                                    }
                                }
                            }
                        }
                    })
                }
            })
        }
        const p = playerRef.current
        if (files.length > 0) {
            p.src({ src: files[currentFileIndex]?.url, type: 'video/mp4' })
        }
        p.on('timeupdate', () => {
            const t = p.currentTime() || 0
            setCurrentTime(t)
            setCurrentTimeInFile(t)
        })
        p.on('ratechange', () => {
            const rate = p.playbackRate()
            setSpeedIndicator(rate)
            if (speedTimerRef.current) clearTimeout(speedTimerRef.current)
            speedTimerRef.current = setTimeout(() => setSpeedIndicator(null), 1000)
        })
        p.on('ended', () => {
            if (currentFileIndex < files.length - 1) {
                setCurrentFileIndex(currentFileIndex + 1)
            }
        })

        return () => {
            // do not dispose across renders in dev HMR
        }
    }, [files, currentFileIndex])

    // Listen for seekToGoal events
    useEffect(() => {
        const handleSeekToGoal = (event: CustomEvent) => {
            const { fileIndex, timeSec } = event.detail
            if (playerRef.current && files.length > 0) {
                // Switch to the correct video if needed
                if (fileIndex !== currentFileIndex && fileIndex < files.length) {
                    setCurrentFileIndex(fileIndex)
                    // Wait for video to load, then seek
                    setTimeout(() => {
                        if (playerRef.current) {
                            playerRef.current.currentTime(timeSec)
                            playerRef.current.play()
                        }
                    }, 100)
                } else if (fileIndex === currentFileIndex) {
                    // Same video, just seek and play
                    playerRef.current.currentTime(timeSec)
                    playerRef.current.play()
                }
            }
        }

        window.addEventListener('seekToGoal', handleSeekToGoal as EventListener)
        return () => {
            window.removeEventListener('seekToGoal', handleSeekToGoal as EventListener)
        }
    }, [currentFileIndex, files, setCurrentFileIndex])

    // Handle preview mode changes
    useEffect(() => {
        if (playerRef.current) {
            if (isPreviewMode) {
                // Disable controls during preview
                playerRef.current.controls(false)
                // Load and play current preview segment
                if (previewSegments.length > 0 && currentPreviewSegment < previewSegments.length) {
                    const segment = previewSegments[currentPreviewSegment]
                    if (segment.sourceFileIndex !== currentFileIndex) {
                        setCurrentFileIndex(segment.sourceFileIndex)
                    }
                    // Wait for video to load, then seek to segment start
                    setTimeout(() => {
                        if (playerRef.current) {
                            playerRef.current.currentTime(segment.startTime)
                            playerRef.current.play()
                        }
                    }, 100)
                }
            } else {
                // Re-enable controls when exiting preview
                playerRef.current.controls(true)
            }
        }
    }, [isPreviewMode, currentPreviewSegment, previewSegments, currentFileIndex, setCurrentFileIndex])

    // Handle segment end detection during preview
    useEffect(() => {
        if (!isPreviewMode || !playerRef.current || previewSegments.length === 0) return

        const handleTimeUpdate = () => {
            if (playerRef.current && currentPreviewSegment < previewSegments.length) {
                const segment = previewSegments[currentPreviewSegment]
                const currentTime = playerRef.current.currentTime()

                // Check if we've reached the end of the current segment
                if (currentTime >= segment.endTime) {
                    // Move to next segment if available
                    if (currentPreviewSegment < previewSegments.length - 1) {
                        nextPreviewSegment()
                    } else {
                        // End of preview - pause
                        playerRef.current.pause()
                    }
                }
            }
        }

        const player = playerRef.current
        if (player) {
            player.on('timeupdate', handleTimeUpdate)
            return () => {
                player.off('timeupdate', handleTimeUpdate)
            }
        }
    }, [isPreviewMode, currentPreviewSegment, previewSegments, nextPreviewSegment])

    // Track fullscreen state
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFS = !!(
                document.fullscreenElement ||
                (document as any).webkitFullscreenElement ||
                (document as any).mozFullScreenElement ||
                (document as any).msFullscreenElement
            )
            console.log('Fullscreen state changed:', isFS)
            setIsFullscreen(isFS)
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
        document.addEventListener('mozfullscreenchange', handleFullscreenChange)
        document.addEventListener('msfullscreenchange', handleFullscreenChange)

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
            document.removeEventListener('msfullscreenchange', handleFullscreenChange)
        }
    }, [])

    return (
        <div ref={containerRef} className="player-container max-h-[50vh] aspect-video mx-auto overflow-hidden rounded-md">
            <video ref={videoRef} className="video-js vjs-default-skin" />
            {speedIndicator !== null && (
                <div className="speed-indicator" key={speedIndicator + '-' + Date.now()}>
                    {speedIndicator.toFixed(2)}x
                </div>
            )}
            <div className="mt-1 px-1 text-xs">
                {isPreviewMode ? (
                    <div className="text-muted">
                        <strong className="text-pink">Preview</strong> — Segment {currentPreviewSegment + 1}/{previewSegments.length}
                        {previewSegments.length > 0 && currentPreviewSegment < previewSegments.length && (
                            <span> — {previewSegments[currentPreviewSegment].goals.length} goal(s)</span>
                        )}
                    </div>
                ) : (
                    <div className="text-muted">
                        File {files.length ? currentFileIndex + 1 : 0}/{files.length} — <span className="text-pink font-semibold tabular-nums">{formatHMS(currentTime)}</span>
                    </div>
                )}
            </div>
            <FullscreenControls playerRef={playerRef} isFullscreen={isFullscreen} />
        </div>
    )
}


