import { useCallback, useEffect, useRef, useState } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import { selectClockLong, useAppState } from '../state'
import { shortcutFor, shouldHandleShortcut } from '../utils/shortcuts'
import { registerPlayerSeekPaused, registerPlayerShortcut, registerPlayerStep, registerPlayerToggle, setPlayerPaused } from './playerControl'
import { runShortcut, seekBy, stepFrame, type ShortcutPlayer } from './playerShortcuts'
import { FullscreenControls } from './FullscreenControls'
import { EventPicker } from './EventPicker'
import { Toast } from './Toast'
import { useFullscreenUi } from './fullscreenUi'
import { patchPlayerFullscreen, type FullscreenPlayer } from './fullscreen'
import { cropTransform } from '../utils/crop'
import { attachPictureGestures } from './pictureGestures'
import { useZoomPan, type ZoomPan } from './useZoomPan'
import { ZoomChip } from './ZoomChip'
import { Scorebug } from './Scorebug'
import { RenderChip } from './RenderChip'
import { PlayIndicator } from './PlayIndicator'
import { formatClock } from '../utils/timeline'
import { playerOptions } from '../utils/playerOptions'
import { previewVolume, shouldAdvance, shouldShowSpeedIndicator } from '../utils/preview'
import { setGraphGain } from './previewGain'
import { playQuietly } from '../utils/playQuietly'
import { reportedTime, seekNow, type PendingSeek } from './pendingSeek'

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
    const [paused, setPaused] = useState(true)
    const [speedIndicator, setSpeedIndicator] = useState<number | null>(null)
    const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const quietRateUntilRef = useRef(0) // the preview's own rate changes (restoring the rate when it ends) don't flash the overlay
    // Preview mode state
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewSteps = useAppState((s) => s.previewSteps)
    const currentPreviewSegment = useAppState((s) => s.currentPreviewSegment)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)
    const previewJumpTick = useAppState((s) => s.previewJumpTick)
    // Zoom / pan of the picture only (Z, 0, drag, wheel, pinch)
    const getViewport = useCallback(() => {
        const el = containerRef.current
        return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 }
    }, [])
    const zoomPan = useZoomPan(getViewport)
    const zoomRef = useRef<ZoomPan>(zoomPan)
    zoomRef.current = zoomPan
    // Zoom is locked in the preview and starts from 1× (clips show the whole picture, as rendered); 1× again afterwards.
    const resetZoom = zoomPan.reset
    useEffect(() => { resetZoom() }, [isPreviewMode, resetZoom])

    // Every player shortcut, wherever focus is (see utils/shortcuts.ts); the event log's own keys stop propagation first.
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.defaultPrevented) return
            const action = shortcutFor(e)
            const player = playerRef.current as ShortcutPlayer | null
            const st = useAppState.getState()
            if (!action || action === 'shortcuts' || !player || !shouldHandleShortcut(e.target, { modalOpen: !!(st.picker || st.panel) })) return
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

    // A seek into another file (or into a file still loading) waits here for that file's metadata.
    const pendingSeekRef = useRef<PendingSeek | null>(null)
    const metadataLoadedRef = useRef(false)

    useEffect(() => {
        if (!videoRef.current || playerRef.current) return
        const p = videojs(videoRef.current, playerOptions(isPreviewMode))
        playerRef.current = p
        patchPlayerFullscreen(p as unknown as FullscreenPlayer, () => containerRef.current, {
            get: () => useAppState.getState().immersive,
            set: (on) => useAppState.getState().setImmersive(on),
        })
        // Registered once; they read the store, so they never act on a stale file index.
        p.on('timeupdate', () => {
            const t = reportedTime(p.currentTime() || 0, pendingSeekRef.current)
            if (t !== null) useAppState.getState().setCurrentTimeInFile(t)
        })
        p.on('loadstart', () => { metadataLoadedRef.current = false })
        p.on('loadedmetadata', () => {
            metadataLoadedRef.current = true
            const pending = pendingSeekRef.current
            if (!pending || pending.fileIndex !== useAppState.getState().currentFileIndex) return
            pendingSeekRef.current = null
            p.currentTime(pending.timeSec)
            if (pending.play) playQuietly(p)
            else p.pause()
        })
        p.on('error', () => { pendingSeekRef.current = null })
        p.on('ratechange', () => {
            if (!shouldShowSpeedIndicator(useAppState.getState().isPreviewMode, performance.now(), quietRateUntilRef.current)) return
            const rate = p.playbackRate() ?? 1
            setSpeedIndicator(rate)
            if (speedTimerRef.current) clearTimeout(speedTimerRef.current)
            speedTimerRef.current = setTimeout(() => setSpeedIndicator(null), 1000)
        })
        p.on('ended', () => {
            const st = useAppState.getState()
            if (st.currentFileIndex < st.files.length - 1) st.setCurrentFileIndex(st.currentFileIndex + 1)
        })
    }, [isPreviewMode])

    useEffect(() => {
        const p = playerRef.current
        if (!p || files.length === 0) return
        metadataLoadedRef.current = false
        p.src({ src: files[currentFileIndex]?.url, type: 'video/mp4' })
    }, [files, currentFileIndex])

    /** Seek anywhere on the timeline. Into another file: the playhead shows the target at once and the seek waits for that file to load. */
    const seekRef = useRef<(fileIndex: number, timeSec: number, play: boolean) => void>(() => {})
    seekRef.current = (fileIndex, timeSec, play) => {
        const p = playerRef.current
        const st = useAppState.getState()
        if (!p || fileIndex < 0 || fileIndex >= st.files.length) return
        if (seekNow(fileIndex, st.currentFileIndex, metadataLoadedRef.current, pendingSeekRef.current)) {
            p.currentTime(timeSec)
            if (play) playQuietly(p)
            else p.pause()
            return
        }
        pendingSeekRef.current = { fileIndex, timeSec, play }
        if (fileIndex !== st.currentFileIndex) st.setCurrentFileIndex(fileIndex)
        st.setCurrentTimeInFile(timeSec)
    }

    // Paused indicator: follows the player's own state (play / pause / ended / a new source).
    useEffect(() => {
        const p = playerRef.current
        if (!p) return
        const sync = (): void => { setPaused(p.paused() !== false); setPlayerPaused(p.paused() !== false) }
        const evts = ['play', 'playing', 'pause', 'ended', 'loadstart', 'emptied']
        sync()
        p.on(evts, sync)
        return () => p.off(evts, sync)
    }, [])

    // Play / pause for the review card, which sits over the global shortcuts.
    useEffect(() => {
        return registerPlayerToggle(() => {
            const p = playerRef.current as ShortcutPlayer | null
            if (!p) return
            if (p.paused()) void Promise.resolve(p.play()).catch(() => undefined)
            else p.pause()
        })
    }, [])

    // One frame / one second steps for the review card.
    useEffect(() => {
        return registerPlayerStep((kind, direction) => {
            const p = playerRef.current as ShortcutPlayer | null
            if (!p) return
            if (kind === 'frame') stepFrame(p, direction)
            else seekBy(p, direction)
        })
    }, [])

    // Seek and speed keys for the review card (the global handler is off while a panel is open).
    useEffect(() => registerPlayerShortcut((action) => {
        const p = playerRef.current as ShortcutPlayer | null
        if (p) runShortcut(action, p, zoomRef.current)
    }), [])

    // Scrubbing the review timeline: seek (switching file if needed) and stay paused.
    useEffect(() => registerPlayerSeekPaused((f, t) => seekRef.current(f, t, false)), [])

    // Event list, match strip and review loop: seek and play.
    useEffect(() => {
        const onSeek = (event: Event) => {
            const { fileIndex, timeSec } = (event as CustomEvent<{ fileIndex: number; timeSec: number }>).detail
            // Watching an event (or scrubbing) during the preview leaves the preview first, so the two never fight.
            const st = useAppState.getState()
            if (st.isPreviewMode) st.exitPreview()
            seekRef.current(fileIndex, timeSec, true)
        }
        window.addEventListener('seekToGoal', onSeek)
        return () => window.removeEventListener('seekToGoal', onSeek)
    }, [])

    // Preview: play each step (clip or slowed replay) from its start, at its speed and volume.
    // The end check only arms once the playhead is seen inside the step, so a playhead that was already
    // past the step's end (or a file still loading) never skips it — preview always starts at clip 1.
    const previewArmedRef = useRef(false)
    const previewLoadingRef = useRef(false)
    const beforePreviewRef = useRef<{ rate: number; volume: number } | null>(null)
    useEffect(() => {
        const p = playerRef.current
        if (!p) return
        const tech = containerRef.current?.querySelector<HTMLMediaElement>('.vjs-tech') ?? null
        if (!isPreviewMode) {
            p.controls(true)
            const before = beforePreviewRef.current
            if (before) { quietRateUntilRef.current = performance.now() + 500; p.playbackRate(before.rate); p.volume(before.volume) }
            if (before && tech) setGraphGain(tech, 1)
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
            const level = previewVolume(beforePreviewRef.current?.volume ?? 1, step)
            p.volume(level)
            if (tech) setGraphGain(tech, step.gain) // iOS ignores volume: the same gain through Web Audio
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
    }, [isPreviewMode, currentPreviewSegment, previewJumpTick, previewSteps, setCurrentFileIndex])

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

    // Pan / zoom gestures on the picture (pictureGestures.ts): drag or one finger pans while zoomed, wheel / pinch zooms.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        return attachPictureGestures(el, () => zoomRef.current, () => useAppState.getState().isPreviewMode)
    }, [])

    // Immersive (CSS) fullscreen: Esc leaves it, as it would real fullscreen; unloading the player ends it.
    const immersive = useAppState((s) => s.immersive)
    useEffect(() => () => { useAppState.getState().setImmersive(false); useAppState.getState().setPlayerFullscreen(false) }, [])
    // Column panels (the review) and toasts render inside the fullscreen element, the only thing on screen in real fullscreen.
    const inFullscreen = isFullscreen || immersive
    useEffect(() => {
        const ui = useFullscreenUi.getState()
        ui.setHost(inFullscreen ? containerRef.current : null)
        ui.setReviewHidden(false)
        return () => { useFullscreenUi.getState().setHost(null) }
    }, [inFullscreen])
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
            <PlayIndicator visible={paused} />
            <Scorebug />
            <ZoomChip zoom={zoomPan.zoom} onReset={zoomPan.reset} />
            {(isFullscreen || immersive) && <RenderChip variant="overlay" />}
            <FullscreenControls playerRef={playerRef} isFullscreen={isFullscreen || immersive} />
            <EventPicker />
            {inFullscreen && <div className="toast-host toast-host--fs"><Toast /></div>}
        </div>
    )
}


