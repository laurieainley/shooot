import { selectMatchStartSec, useAppState } from '../state'
import { DEFAULT_FPS, frameStepTime, seekStepFor } from '../utils/hotkeys'
import { homeTarget, startInFile } from '../utils/markers'
import type { ShortcutAction } from '../utils/shortcuts'
import type { ZoomPan } from './useZoomPan'
import { seekPlayer } from './playerControl'

/** The slice of the video.js player the shortcuts drive. */
export type ShortcutPlayer = {
    paused: () => boolean
    play: () => Promise<void> | void
    pause: () => void
    currentTime: (t?: number) => number | void
    duration: () => number
    muted: (m?: boolean) => boolean | void
    playbackRate: (r?: number) => number | void
    isFullscreen: () => boolean | undefined
    requestFullscreen: () => unknown
    exitFullscreen: () => unknown
}

const time = (p: ShortcutPlayer): number => (p.currentTime() as number) || 0

/** Close enough to a file's end that a skip forward goes on into the next file (a seek to the very end would just stop there). */
const END_SLACK_SEC = 0.25

/**
 * Moves the playhead by `step` seconds. A step past the end of the file carries on into the next file (past the start: into the
 * end of the previous one), keeping play or pause, so skipping runs across the match's files as if they were one video.
 */
export function seekBy(p: ShortcutPlayer, step: number): void {
    const end = p.duration() || Infinity
    const target = time(p) + step
    if (step > 0 && Number.isFinite(end) && target >= end - END_SLACK_SEC && crossFile(1, Math.max(0, target - end), p)) return
    if (step < 0 && target < 0 && crossFile(-1, target, p)) return
    p.currentTime(Math.min(Math.max(0, target), end))
}

/** Seeks into the neighbouring file: `over` seconds into the next one, or `over` (negative) before the previous one's end. */
function crossFile(dir: 1 | -1, over: number, p: ShortcutPlayer): boolean {
    const st = useAppState.getState()
    const i = st.currentFileIndex + dir
    const f = st.files[i]
    if (!f) return false
    let t = over
    if (dir < 0) {
        if (!f.durationSec) return false
        t = Math.max(0, f.durationSec + over)
    } else if (f.durationSec) t = Math.min(t, Math.max(0, f.durationSec - END_SLACK_SEC))
    return seekPlayer(i, t, !p.paused())
}

export function stepFrame(p: ShortcutPlayer, direction: 1 | -1): void {
    p.pause()
    p.currentTime(frameStepTime(time(p), direction, DEFAULT_FPS, p.duration() || Infinity))
}

function switchFile(delta: 1 | -1): void {
    const st = useAppState.getState()
    const next = st.currentFileIndex + delta
    if (next >= 0 && next < st.files.length) st.setCurrentFileIndex(next)
}

/** Runs one shortcut on the player: the single place keys become player actions (see utils/shortcuts.ts for when they apply). */
export function runShortcut(action: ShortcutAction, p: ShortcutPlayer, zoom: ZoomPan): void {
    const rate = (p.playbackRate() as number) || 1
    switch (action) {
        case 'playPause': if (p.paused()) void Promise.resolve(p.play()).catch(() => undefined); else p.pause(); break
        case 'seekBack': seekBy(p, -seekStepFor({ shiftKey: false })); break
        case 'seekForward': seekBy(p, seekStepFor({ shiftKey: false })); break
        case 'seekBackFine': seekBy(p, -seekStepFor({ shiftKey: true })); break
        case 'seekForwardFine': seekBy(p, seekStepFor({ shiftKey: true })); break
        case 'frameForward': stepFrame(p, 1); break
        case 'frameBack': stepFrame(p, -1); break
        case 'mark': useAppState.getState().markEvent(time(p)); break
        case 'mute': p.muted(!p.muted()); break
        case 'fullscreen': if (p.isFullscreen()) p.exitFullscreen(); else p.requestFullscreen(); break
        // Zoom is locked in the preview (clips show the whole picture, as rendered).
        case 'zoomCycle': if (!useAppState.getState().isPreviewMode) zoom.cycle(); break
        case 'zoomReset': if (!useAppState.getState().isPreviewMode) zoom.reset(); break
        case 'speedDown': p.playbackRate(Math.max(0.25, rate - 0.25)); break
        case 'speedUp': p.playbackRate(Math.min(4, rate + 0.25)); break
        case 'speedReset': p.playbackRate(1); break
        case 'jumpStart': {
            const st = useAppState.getState()
            p.currentTime(homeTarget(time(p), startInFile(selectMatchStartSec(st), st.cumulativeOffsets, st.currentFileIndex, p.duration() || 0)))
            break
        }
        case 'jumpEnd': { const d = p.duration(); if (d) p.currentTime(d - 1); break }
        // In the preview, [ ] move between clips instead of files.
        case 'prevFile': if (useAppState.getState().isPreviewMode) useAppState.getState().stepPreviewClip(-1); else switchFile(-1); break
        case 'nextFile': if (useAppState.getState().isPreviewMode) useAppState.getState().stepPreviewClip(1); else switchFile(1); break
    }
}
