import { useEffect, useState } from 'react'
import { isNearBlack } from '../utils/blackFrame'

export type Frame = { src: string; aspect: number }
export type FrameState = { status: 'idle' | 'loading' | 'ready' | 'error'; frame: Frame | null }

const PAINT_WAIT_MS = 250
const RETRY_WAIT_MS = 250
const NUDGE_SEC = 0.1
const PROBE = 16

/** Resolves once the browser has presented the current frame (`requestVideoFrameCallback`), or after a short wait where that is missing. */
function framePainted(v: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
        let finished = false
        const finish = (): void => { if (!finished) { finished = true; resolve() } }
        setTimeout(finish, PAINT_WAIT_MS)
        if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(() => finish())
    })
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Whether the video's current picture is (near-)black, judged from a tiny copy of it. */
function looksBlack(v: HTMLVideoElement): boolean {
    const probe = document.createElement('canvas')
    probe.width = PROBE
    probe.height = PROBE
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(v, 0, 0, PROBE, PROBE)
    return isNearBlack(ctx.getImageData(0, 0, PROBE, PROBE).data)
}

/**
 * A still of the video at `atSec` as a JPEG data URL (at most `maxWidth` wide). Rejects when the browser cannot show it.
 * Android fires `seeked` before the frame is painted, so it waits for the frame to be presented, and tries once more
 * (after a short wait and a tiny nudge in time) when the picture still comes out black.
 */
export function grabFrame(url: string, atSec: number, maxWidth = 960): Promise<Frame> {
    return new Promise((resolve, reject) => {
        const v = document.createElement('video')
        v.muted = true
        v.preload = 'auto'
        v.playsInline = true
        const done = (fn: () => void): void => { v.removeAttribute('src'); v.load(); fn() }
        const timer = setTimeout(() => done(() => reject(new Error('timed out'))), 15000)
        const fail = (e: unknown): void => { clearTimeout(timer); done(() => reject(e instanceof Error ? e : new Error(String(e)))) }
        const target = (): number => Math.max(0, Math.min(atSec, (v.duration || atSec) - 0.1))
        let retried = false
        const draw = (): Frame => {
            const scale = Math.min(1, maxWidth / v.videoWidth)
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(1, Math.round(v.videoWidth * scale))
            canvas.height = Math.max(1, Math.round(v.videoHeight * scale))
            canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
            return { src: canvas.toDataURL('image/jpeg', 0.82), aspect: v.videoWidth / v.videoHeight }
        }
        v.onerror = () => fail(new Error('this browser cannot show that video'))
        v.onloadedmetadata = () => { v.currentTime = target() }
        v.onseeked = () => {
            void (async () => {
                try {
                    await framePainted(v)
                    if (!retried && looksBlack(v)) {
                        retried = true
                        await wait(RETRY_WAIT_MS)
                        await framePainted(v)
                        if (looksBlack(v)) {
                            // Still nothing: nudge to a neighbouring frame; the next `seeked` draws whatever is there.
                            v.currentTime = Math.min(target() + NUDGE_SEC, Math.max(0, (v.duration || atSec) - 0.05))
                            return
                        }
                    }
                    const frame = draw()
                    clearTimeout(timer)
                    done(() => resolve(frame))
                } catch (e) { fail(e) }
            })()
        }
        v.src = url
    })
}

/** The frame of a loaded file at a time (null url = nothing to show). */
export function useFrameAt(url: string | null | undefined, atSec: number | null): FrameState {
    const [state, setState] = useState<FrameState & { key: string }>({ status: 'idle', frame: null, key: '' })
    const key = url && atSec !== null ? `${url}@${Math.round(atSec * 10)}` : ''
    useEffect(() => {
        if (!key || !url || atSec === null) return
        let live = true
        grabFrame(url, atSec)
            .then((frame) => { if (live) setState({ status: 'ready', frame, key }) })
            .catch(() => { if (live) setState({ status: 'error', frame: null, key }) })
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    if (!key) return { status: 'idle', frame: null }
    return state.key === key ? { status: state.status, frame: state.frame } : { status: 'loading', frame: null }
}

/**
 * Like `useFrameAt`, but for a picture the user scrubs through: the previous frame stays on show until the next one
 * is ready (`status` is 'loading' meanwhile), and a failed grab keeps the last good frame. Pass a null url to do nothing.
 */
export function useStillAt(url: string | null | undefined, atSec: number | null, maxWidth = 960): FrameState {
    const [state, setState] = useState<FrameState & { key: string }>({ status: 'idle', frame: null, key: '' })
    const key = url && atSec !== null ? `${url}@${Math.round(atSec * 10)}@${maxWidth}` : ''
    useEffect(() => {
        if (!key || !url || atSec === null) return
        let live = true
        grabFrame(url, atSec, maxWidth)
            .then((frame) => { if (live) setState({ status: 'ready', frame, key }) })
            .catch(() => { if (live) setState((s) => ({ status: 'error', frame: s.frame, key })) })
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    if (!key) return { status: 'idle', frame: null }
    return state.key === key ? { status: state.status, frame: state.frame } : { status: 'loading', frame: state.frame }
}
