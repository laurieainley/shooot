import { selectMatchStartSec, useAppState } from '../state'
import { DEFAULT_FPS, frameStepTime, seekStepFor } from '../utils/hotkeys'
import { homeTarget, startInFile } from '../utils/markers'
import type { ShortcutAction } from '../utils/shortcuts'
import type { ZoomPan } from './useZoomPan'

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

function seekBy(p: ShortcutPlayer, step: number): void {
    const end = p.duration() || Infinity
    p.currentTime(Math.min(Math.max(0, time(p) + step), end))
}

function stepFrame(p: ShortcutPlayer, direction: 1 | -1): void {
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
        case 'zoomCycle': zoom.cycle(); break
        case 'zoomReset': zoom.reset(); break
        case 'speedDown': p.playbackRate(Math.max(0.25, rate - 0.25)); break
        case 'speedUp': p.playbackRate(Math.min(4, rate + 0.25)); break
        case 'speedReset': p.playbackRate(1); break
        case 'jumpStart': {
            const st = useAppState.getState()
            p.currentTime(homeTarget(time(p), startInFile(selectMatchStartSec(st), st.cumulativeOffsets, st.currentFileIndex, p.duration() || 0)))
            break
        }
        case 'jumpEnd': { const d = p.duration(); if (d) p.currentTime(d - 1); break }
        case 'prevFile': switchFile(-1); break
        case 'nextFile': switchFile(1); break
    }
}
