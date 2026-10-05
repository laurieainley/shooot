import { useEffect, useState, type RefObject } from 'react'
import { useAppState } from '../state'
import { SCRUB_IDLE, scrubReducer, scrubTimeAt, type ScrubAction, type ScrubState } from '../utils/scrub'

type ScrubPlayer = {
    paused: () => boolean
    play: () => unknown
    pause: () => unknown
    currentTime: (t?: number) => number
    duration: () => number
}

export type ScrubBubble = { timeSec: number; leftPx: number }

/**
 * Touch drags on the video.js progress bar: video.js would seek on every move, which stutters on phones with
 * big files. Take the touch over (capture phase on the player container), preview the time in a bubble and on
 * the match strip, seek once on release (see utils/scrub). Mouse scrubbing is left to video.js.
 */
export function useTouchScrub(containerRef: RefObject<HTMLElement | null>, playerRef: RefObject<ScrubPlayer | null>): ScrubBubble | null {
    const [bubble, setBubble] = useState<ScrubBubble | null>(null)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        let state: ScrubState = SCRUB_IDLE
        let bar: HTMLElement | null = null

        const apply = (action: ScrubAction, clientX = 0): void => {
            const p = playerRef.current
            if (!p) return
            const r = scrubReducer(state, action)
            state = r.state
            for (const fx of r.effects) {
                if (fx.kind === 'pause') p.pause()
                else if (fx.kind === 'play') void Promise.resolve(p.play()).catch(() => undefined)
                else if (fx.kind === 'seek') p.currentTime(fx.timeSec)
                else if (fx.kind === 'end') setBubble(null)
                else {
                    const box = el.getBoundingClientRect()
                    const leftPx = Math.min(box.width - 36, Math.max(36, clientX - box.left))
                    setBubble({ timeSec: fx.timeSec, leftPx })
                    useAppState.getState().setCurrentTimeInFile(fx.timeSec) // the match-strip playhead follows the finger
                }
            }
        }
        const timeAt = (clientX: number): number =>
            scrubTimeAt(clientX, bar?.getBoundingClientRect() ?? { left: 0, width: 0 }, playerRef.current?.duration() || 0)

        const onStart = (e: TouchEvent): void => {
            const ctl = (e.target as HTMLElement | null)?.closest?.('.vjs-progress-control')
            if (!ctl || e.touches.length !== 1 || !playerRef.current) return
            bar = ctl.querySelector<HTMLElement>('.vjs-progress-holder') ?? (ctl as HTMLElement)
            e.stopPropagation() // keep video.js's own seek-on-drag from starting
            e.preventDefault()  // and no emulated mouse events either
            const x = e.touches[0].clientX
            apply({ kind: 'down', timeSec: timeAt(x), playing: !playerRef.current.paused() }, x)
        }
        const onMove = (e: TouchEvent): void => {
            if (!state.active || e.touches.length === 0) return
            e.preventDefault()
            const x = e.touches[0].clientX
            apply({ kind: 'move', timeSec: timeAt(x) }, x)
        }
        const onEnd = (): void => { if (state.active) apply({ kind: 'up' }) }
        const onCancel = (): void => { if (state.active) apply({ kind: 'cancel' }) }

        el.addEventListener('touchstart', onStart, { capture: true, passive: false })
        window.addEventListener('touchmove', onMove, { passive: false })
        window.addEventListener('touchend', onEnd)
        window.addEventListener('touchcancel', onCancel)
        return () => {
            el.removeEventListener('touchstart', onStart, { capture: true })
            window.removeEventListener('touchmove', onMove)
            window.removeEventListener('touchend', onEnd)
            window.removeEventListener('touchcancel', onCancel)
        }
    }, [containerRef, playerRef])

    return bubble
}
