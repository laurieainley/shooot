import { useCallback, useEffect, useRef, useState } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import { shortcutFor, shouldHandleShortcut } from '../utils/shortcuts'
import { runShortcut, type ShortcutPlayer } from './playerShortcuts'
import { FullscreenControls } from './FullscreenControls'
import { EventPicker } from './EventPicker'
import { TimelineMarkers } from './TimelineMarkers'
import { patchPlayerFullscreen, type FullscreenPlayer } from './fullscreen'
import { cropTransform } from '../utils/crop'
import { classifyPointer, wheelZoomFactor } from '../utils/zoom'
import { useZoomPan, type ZoomPan } from './useZoomPan'
import { ZoomChip } from './ZoomChip'
import { RenderChip } from './RenderChip'
import { useTouchScrub } from './useTouchScrub'
import { PlayIndicator } from './PlayIndicator'
import { formatClock, formatEventClock } from '../utils/timeline'
import { playerOptions } from '../utils/playerOptions'
import { shouldAdvance } from '../utils/preview'

// video.js shows "0:05 / 24:00"; every time on screen uses the project's fixed width format instead.
videojs.setFormatTime((seconds: number, guide: number) => formatClock(seconds, selectClockLong(useAppState.getState()) || guide >= 3600))

export function Player() {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const playerRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const files = useAppState((s) => s.files)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const setCurrentFileIndex = useAppState((s) => s.setCurrentFileIndex)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [durationSec, setDurationSec] = useState(0)
    const [paused, setPaused] = useState(true)
    const [progressHost, setProgressHost] = useState<HTMLElement | null>(null)
    const [speedIndicator, setSpeedIndicator] = useState<number | null>(null)
    const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const setCurrentTimeInFile = useAppState((s) => s.setCurrentTimeInFile)
    // Preview mode state
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewSteps = useAppState((s) => s.previewSteps)
    const currentPreviewSegment = useAppState((s) => s.currentPreviewSegment)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)
    // Zoom / pan of the picture only (Z, 0, drag, wheel, pinch)
    const getViewport = useCallback(() => {
        const el = containerRef.current
        return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 }
    }, [])
    const zoomPan = useZoomPan(getViewport)
    const zoomRef = useRef<ZoomPan>(zoomPan)
    zoomRef.current = zoomPan
    const scrub = useTouchScrub(containerRef, playerRef)
    // The scrub bubble speaks match time (from kick-off), like the strip label and the event log.
    const matchStartSec = useAppState(selectMatchStartSec)
    const clockLong = useAppState(selectClockLong)
    const fileOffset = useAppState((s) => s.cumulativeOffsets[s.currentFileIndex] ?? 0)

    // Every player shortcut, wherever focus is (see utils/shortcuts.ts); the event log's own keys stop propagation first.
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.defaultPrevented) return
            const action = shortcutFor(e)
            const player = playerRef.current as ShortcutPlayer | null
            const st = useAppState.getState()
            if (!action || !player || !shouldHandleShortcut(e.target, { modalOpen: !!(st.picker || st.panel) })) return
            e.preventDefault()
            e.stopPropagation()
            runShortcut(action, player, zoomRef.current)
        }
        // Space on a focused button activates it on key-up: the key-up of a handled Space must not click anything.
        const onKeyUp = (e: KeyboardEvent): void => {
            if (e.key !== ' ') return
            const st = useAppState.getState()
            if (shouldHandleShortcut(e.target, { modalOpen: !!(st.picker || st.panel) })) e.preventDefault()
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKeyUp)
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
    }, [])

    useEffect(() => {
        if (!videoRef.current) return
        if (!playerRef.current) {
            playerRef.current = videojs(videoRef.current, playerOptions(isPreviewMode))
            patchPlayerFullscreen(playerRef.current as unknown as FullscreenPlayer, () => containerRef.current, {
                get: () => useAppState.getState().immersive,
                set: (on) => useAppState.getState().setImmersive(on),
            })

            // Once the player is ready: the progress bar hosts the scrubber markers
            playerRef.current.ready(() => {
                if (playerRef.current) {
                    setProgressHost(playerRef.current.el().querySelector('.vjs-progress-holder'))
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

    // Paused indicator: follows the player's own state (play / pause / ended / a new source).
    useEffect(() => {
        const p = playerRef.current
        if (!p) return
        const sync = (): void => setPaused(p.paused() !== false)
        const evts = ['play', 'playing', 'pause', 'ended', 'loadstart', 'emptied']
        sync()
        p.on(evts, sync)
        return () => p.off(evts, sync)
    }, [])

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
    const { zoom: userZoom, pan: userPan } = zoomPan
    useEffect(() => {
        const tech = containerRef.current?.querySelector<HTMLElement>('.vjs-tech')
        if (!tech) return
        // Preview replays show the part of the picture the render crops to (same maths, so what you see is what you get).
        const crop = isPreviewMode ? previewSteps[currentPreviewSegment]?.crop : undefined
        let zoom = userZoom
        let pan = userPan
        if (crop) {
            const video = tech as HTMLVideoElement
            const box = { width: tech.clientWidth, height: tech.clientHeight }
            const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : box.width / (box.height || 1)
            // The picture sits letterboxed in the element: fractions of the frame are fractions of that picture.
            const content = box.width / (box.height || 1) > aspect ? { width: box.height * aspect, height: box.height } : { width: box.width, height: box.width / aspect }
            ;({ zoom, pan } = cropTransform(crop, content))
        }
        tech.style.transform = zoom > 1 ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : ''
    }, [userZoom, userPan, currentFileIndex, files, isPreviewMode, previewSteps, currentPreviewSegment])

    // Mouse: drag the picture to pan while zoomed, wheel / trackpad pinch zooms towards the cursor, two-finger scroll pans.
    // Touch: two-finger drag pans, a two-finger pinch zooms between 1× and 4×.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const pointers = new Map<number, { x: number; y: number }>()
        let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null
        let mouse: { id: number; start: { x: number; y: number }; at: number; dragging: boolean } | null = null
        let dragged = false
        const spread = (): { dist: number; mid: { x: number; y: number } } => {
            const [a, b] = Array.from(pointers.values())
            return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
        }
        const onPicture = (e: Event): boolean => !(e.target as HTMLElement).closest('.vjs-control-bar, button, .event-picker, .vjs-menu')
        const onDown = (e: PointerEvent): void => {
            if (!onPicture(e)) return
            if (e.pointerType === 'touch') {
                pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
                dragged = false
                if (pointers.size === 2) {
                    const s = spread()
                    pinch = { dist: s.dist, zoom: zoomRef.current.zoom, mid: s.mid }
                }
            } else if (e.button === 0 && zoomRef.current.zoom > 1) {
                pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
                mouse = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, at: performance.now(), dragging: false }
                dragged = false
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
            } else if (mouse && mouse.id === e.pointerId) {
                if (!mouse.dragging) {
                    const kind = classifyPointer(Math.hypot(e.clientX - mouse.start.x, e.clientY - mouse.start.y), 0)
                    if (kind === 'click') return
                    mouse.dragging = true
                    dragged = true
                    el.classList.add('zoom-dragging')
                    try { el.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
                }
                zoomRef.current.panBy(e.clientX - prev.x, e.clientY - prev.y)
                e.preventDefault()
            }
        }
        const onUp = (e: PointerEvent): void => {
            if (!pointers.delete(e.pointerId)) return
            if (mouse && mouse.id === e.pointerId) {
                // A slow press without movement is neither a click nor a pan: leave the click alone only when it qualifies.
                if (!mouse.dragging && classifyPointer(Math.hypot(e.clientX - mouse.start.x, e.clientY - mouse.start.y), performance.now() - mouse.at) === 'drag') dragged = true
                if (mouse.dragging) try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
                el.classList.remove('zoom-dragging')
                mouse = null
            }
            if (pinch && pointers.size < 2) { pinch = null; zoomRef.current.pinchEnd() }
        }
        // A pan or pinch must not also toggle play / count as a tap.
        const onClick = (e: MouseEvent): void => {
            if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false }
        }
        const onWheel = (e: WheelEvent): void => {
            if (!onPicture(e)) return
            const z = zoomRef.current
            if (!e.ctrlKey && z.zoom <= 1) return
            const rect = el.getBoundingClientRect()
            if (e.ctrlKey) {
                z.zoomAt(wheelZoomFactor(e.deltaY), { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 })
            } else {
                z.panBy(-e.deltaX, -e.deltaY)
            }
            e.preventDefault()
        }
        el.addEventListener('pointerdown', onDown, true)
        window.addEventListener('pointermove', onMove, { capture: true, passive: false })
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onUp, true)
        el.addEventListener('click', onClick, true)
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => {
            el.removeEventListener('pointerdown', onDown, true)
            window.removeEventListener('pointermove', onMove, true)
            window.removeEventListener('pointerup', onUp, true)
            window.removeEventListener('pointercancel', onUp, true)
            el.removeEventListener('click', onClick, true)
            el.removeEventListener('wheel', onWheel)
        }
    }, [])

    // Immersive (CSS) fullscreen: Esc leaves it, as it would real fullscreen; unloading the player ends it.
    const immersive = useAppState((s) => s.immersive)
    useEffect(() => () => { useAppState.getState().setImmersive(false); useAppState.getState().setPlayerFullscreen(false) }, [])
    // Fullscreen has no event list to edit from: leaving the edit panel open would only be hidden behind the picture.
    useEffect(() => { if (isFullscreen || immersive) { const st = useAppState.getState(); if (st.panel === 'event') st.closePanel() } }, [isFullscreen, immersive])
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
            const full = el !== null && el === containerRef.current
            setIsFullscreen(full)
            useAppState.getState().setPlayerFullscreen(full)
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
            <PlayIndicator visible={paused && !scrub} />
            <ZoomChip zoom={zoomPan.zoom} onReset={zoomPan.reset} />
            {(isFullscreen || immersive) && <RenderChip variant="overlay" />}
            {scrub && <div className="scrub-bubble tc clock" style={{ left: scrub.leftPx }}>{formatEventClock(fileOffset + scrub.timeSec, scrub.timeSec, matchStartSec, clockLong)}</div>}
            <FullscreenControls playerRef={playerRef} isFullscreen={isFullscreen || immersive} />
            <EventPicker />
            <TimelineMarkers host={progressHost} durationSec={durationSec} />
        </div>
    )
}


