import { useCallback, useEffect, useRef, useState } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import 'videojs-hotkeys'
import { useAppState } from '../state'
import { seekStepFor, frameStepTime, DEFAULT_FPS } from '../utils/hotkeys'
import { FullscreenControls } from './FullscreenControls'
import { EventPicker } from './EventPicker'
import { TimelineMarkers } from './TimelineMarkers'
import { patchPlayerFullscreen, type FullscreenPlayer } from './fullscreen'
import { homeTarget, startInFile } from '../utils/markers'
import { useZoomPan, type ZoomPan } from './useZoomPan'
import { ZoomChip } from './ZoomChip'
import { useTouchScrub } from './useTouchScrub'
import { formatHMS } from '../utils/timeline'
import { playerOptions } from '../utils/playerOptions'
import { shouldAdvance } from '../utils/preview'

type FrameStepPlayer = { pause: () => void; currentTime: (t?: number) => number; duration: () => number }

export function Player() {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const playerRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const files = useAppState((s) => s.files)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const setCurrentFileIndex = useAppState((s) => s.setCurrentFileIndex)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [durationSec, setDurationSec] = useState(0)
    const [progressHost, setProgressHost] = useState<HTMLElement | null>(null)
    const [speedIndicator, setSpeedIndicator] = useState<number | null>(null)
    const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const setCurrentTimeInFile = useAppState((s) => s.setCurrentTimeInFile)
    // Preview mode state
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewSteps = useAppState((s) => s.previewSteps)
    const currentPreviewSegment = useAppState((s) => s.currentPreviewSegment)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)
    // Zoom / pan of the picture only (Z, 0, Shift-drag, pinch)
    const getViewport = useCallback(() => {
        const el = containerRef.current
        return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 }
    }, [])
    const zoomPan = useZoomPan(getViewport)
    const zoomRef = useRef<ZoomPan>(zoomPan)
    zoomRef.current = zoomPan
    const scrub = useTouchScrub(containerRef, playerRef)

    useEffect(() => {
        if (!videoRef.current) return
        if (!playerRef.current) {
            playerRef.current = videojs(videoRef.current, playerOptions(isPreviewMode))
            patchPlayerFullscreen(playerRef.current as unknown as FullscreenPlayer, () => containerRef.current, {
                get: () => useAppState.getState().immersive,
                set: (on) => useAppState.getState().setImmersive(on),
            })

            // Enable hotkeys once the player is ready
            playerRef.current.ready(() => {
                if (playerRef.current) {
                    setProgressHost(playerRef.current.el().querySelector('.vjs-progress-holder'))
                    ;(playerRef.current as any).hotkeys({
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
                            zoomCycle: {
                                key: (event: KeyboardEvent) => event.which === 90 && !event.metaKey && !event.ctrlKey && !event.altKey, // Z
                                handler: () => zoomRef.current.cycle(),
                            },
                            zoomReset: {
                                key: (event: KeyboardEvent) => (event.which === 48 || event.which === 96) && !event.metaKey && !event.ctrlKey, // 0
                                handler: () => zoomRef.current.reset(),
                            },
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
                                    const st = useAppState.getState()
                                    const start = startInFile(st.matchStartTimeSec, st.cumulativeOffsets, st.currentFileIndex, player.duration() || 0)
                                    player.currentTime(homeTarget(player.currentTime() || 0, start))
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
                            // G key - mark an event at the current time and open the picker (M is video.js mute)
                            addGoal: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 71; // G
                                },
                                handler: function (player: any) {
                                    useAppState.getState().markEvent(player.currentTime() || 0)
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
            setCurrentTimeInFile(t)
        })
        p.on('durationchange', () => setDurationSec(p.duration() || 0))
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

    // Preview: play each step (clip or slowed replay) from its start, at its speed and volume.
    // The end check only arms once the playhead is seen inside the step, so a playhead that was already
    // past the step's end (or a file still loading) never skips it — preview always starts at clip 1.
    const previewArmedRef = useRef(false)
    const previewLoadingRef = useRef(false)
    const beforePreviewRef = useRef<{ rate: number; volume: number } | null>(null)
    useEffect(() => {
        const p = playerRef.current
        if (!p) return
        if (!isPreviewMode) {
            p.controls(true)
            const before = beforePreviewRef.current
            if (before) { p.playbackRate(before.rate); p.volume(before.volume) }
            beforePreviewRef.current = null
            return
        }
        p.controls(false)
        if (!beforePreviewRef.current) beforePreviewRef.current = { rate: p.playbackRate() || 1, volume: p.volume() ?? 1 }
        const step = previewSteps[currentPreviewSegment]
        if (!step) return
        let cancelled = false
        previewArmedRef.current = false
        const go = (): void => {
            if (cancelled) return
            previewLoadingRef.current = false
            p.currentTime(step.startSec)
            p.playbackRate(step.speed) // pitch is preserved by the browser
            p.volume((beforePreviewRef.current?.volume ?? 1) * step.gain)
            void Promise.resolve(p.play()).catch(() => undefined)
        }
        if (step.sourceIndex !== useAppState.getState().currentFileIndex) {
            previewLoadingRef.current = true
            p.pause()
            p.one('loadedmetadata', go)
            setCurrentFileIndex(step.sourceIndex)
        } else {
            go()
        }
        return () => { cancelled = true; p.off('loadedmetadata', go) }
    }, [isPreviewMode, currentPreviewSegment, previewSteps, setCurrentFileIndex])

    useEffect(() => {
        const p = playerRef.current
        const step = previewSteps[currentPreviewSegment]
        if (!isPreviewMode || !p || !step) return
        const onTime = (): void => {
            if (previewLoadingRef.current) return
            const t = p.currentTime() || 0
            if (t >= step.startSec - 0.5 && t < step.endSec - 0.05) previewArmedRef.current = true
            if (!shouldAdvance(t, step, previewArmedRef.current)) return
            previewArmedRef.current = false
            if (currentPreviewSegment < previewSteps.length - 1) nextPreviewSegment()
            else p.pause()
        }
        p.on('timeupdate', onTime)
        return () => p.off('timeupdate', onTime)
    }, [isPreviewMode, currentPreviewSegment, previewSteps, nextPreviewSegment])

    // Apply the zoom to the video picture (the tech element), not to the controls.
    useEffect(() => {
        const tech = containerRef.current?.querySelector<HTMLElement>('.vjs-tech')
        if (!tech) return
        tech.style.transform = zoomPan.zoom > 1 ? `translate(${zoomPan.pan.x}px, ${zoomPan.pan.y}px) scale(${zoomPan.zoom})` : ''
    }, [zoomPan.zoom, zoomPan.pan, currentFileIndex, files])

    // Shift+drag (mouse) or two-finger drag pans while zoomed; a two-finger pinch zooms between 1× and 4×.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const pointers = new Map<number, { x: number; y: number }>()
        let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null
        let dragged = false
        const spread = (): { dist: number; mid: { x: number; y: number } } => {
            const [a, b] = Array.from(pointers.values())
            return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
        }
        const onDown = (e: PointerEvent): void => {
            const touch = e.pointerType === 'touch'
            if (!touch && !(e.shiftKey && zoomRef.current.zoom > 1)) return
            if ((e.target as HTMLElement).closest('.vjs-control-bar, button, .event-picker')) return
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
            dragged = false
            if (pointers.size === 2) {
                const s = spread()
                pinch = { dist: s.dist, zoom: zoomRef.current.zoom, mid: s.mid }
            }
        }
        const onMove = (e: PointerEvent): void => {
            const prev = pointers.get(e.pointerId)
            if (!prev) return
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (pinch && pointers.size === 2) {
                const s = spread()
                if (pinch.dist > 0) zoomRef.current.pinchTo(pinch.zoom * (s.dist / pinch.dist))
                zoomRef.current.panBy(s.mid.x - pinch.mid.x, s.mid.y - pinch.mid.y)
                pinch.mid = s.mid
                dragged = true
                e.preventDefault()
            } else if (e.pointerType !== 'touch' && e.shiftKey) {
                zoomRef.current.panBy(e.clientX - prev.x, e.clientY - prev.y)
                dragged = true
                e.preventDefault()
            }
        }
        const onUp = (e: PointerEvent): void => {
            if (!pointers.delete(e.pointerId)) return
            if (pinch && pointers.size < 2) { pinch = null; zoomRef.current.pinchEnd() }
        }
        // A pan or pinch must not also toggle play / count as a tap.
        const onClick = (e: MouseEvent): void => {
            if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false }
        }
        el.addEventListener('pointerdown', onDown, true)
        window.addEventListener('pointermove', onMove, { capture: true, passive: false })
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onUp, true)
        el.addEventListener('click', onClick, true)
        return () => {
            el.removeEventListener('pointerdown', onDown, true)
            window.removeEventListener('pointermove', onMove, true)
            window.removeEventListener('pointerup', onUp, true)
            window.removeEventListener('pointercancel', onUp, true)
            el.removeEventListener('click', onClick, true)
        }
    }, [])

    // Immersive (CSS) fullscreen: Esc leaves it, as it would real fullscreen; unloading the player ends it.
    const immersive = useAppState((s) => s.immersive)
    useEffect(() => () => useAppState.getState().setImmersive(false), [])
    useEffect(() => {
        if (!immersive) return
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape' && !useAppState.getState().picker) { e.preventDefault(); playerRef.current?.exitFullscreen() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [immersive])

    // Track fullscreen state (also on resize / rotation: leaving fullscreen by rotating may not fire an event)
    useEffect(() => {
        const sync = (): void => {
            const d = document as Document & { webkitFullscreenElement?: Element | null }
            const el = d.fullscreenElement ?? d.webkitFullscreenElement ?? null
            setIsFullscreen(el !== null && el === containerRef.current)
        }
        const events = ['fullscreenchange', 'webkitfullscreenchange'] as const
        for (const e of events) document.addEventListener(e, sync)
        window.addEventListener('resize', sync)
        window.addEventListener('orientationchange', sync)
        return () => {
            for (const e of events) document.removeEventListener(e, sync)
            window.removeEventListener('resize', sync)
            window.removeEventListener('orientationchange', sync)
        }
    }, [])

    return (
        <div ref={containerRef} className={`player-container${zoomPan.zoom > 1 ? ' player-container--zoomed' : ''}${immersive ? ' player-container--immersive' : ''}`}>
            <video ref={videoRef} className="video-js vjs-default-skin" />
            {speedIndicator !== null && (
                <div className="speed-indicator" key={speedIndicator + '-' + Date.now()}>
                    {speedIndicator.toFixed(2)}x
                </div>
            )}
            <ZoomChip zoom={zoomPan.zoom} onReset={zoomPan.reset} />
            {scrub && <div className="scrub-bubble tc" style={{ left: scrub.leftPx }}>{formatHMS(scrub.timeSec)}</div>}
            <FullscreenControls playerRef={playerRef} isFullscreen={isFullscreen || immersive} />
            <EventPicker />
            <TimelineMarkers host={progressHost} durationSec={durationSec} />
        </div>
    )
}


