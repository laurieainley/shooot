import { useEffect, useState } from 'react'

export type Frame = { src: string; aspect: number }
export type FrameState = { status: 'idle' | 'loading' | 'ready' | 'error'; frame: Frame | null }

/** A still of the video at `atSec` as a JPEG data URL (at most `maxWidth` wide). Rejects when the browser cannot show it. */
export function grabFrame(url: string, atSec: number, maxWidth = 960): Promise<Frame> {
    return new Promise((resolve, reject) => {
        const v = document.createElement('video')
        v.muted = true
        v.preload = 'auto'
        v.playsInline = true
        const done = (fn: () => void): void => { v.removeAttribute('src'); v.load(); fn() }
        const timer = setTimeout(() => done(() => reject(new Error('timed out'))), 15000)
        v.onerror = () => { clearTimeout(timer); done(() => reject(new Error('this browser cannot show that video'))) }
        v.onloadedmetadata = () => { v.currentTime = Math.max(0, Math.min(atSec, (v.duration || atSec) - 0.1)) }
        v.onseeked = () => {
            try {
                const scale = Math.min(1, maxWidth / v.videoWidth)
                const canvas = document.createElement('canvas')
                canvas.width = Math.max(1, Math.round(v.videoWidth * scale))
                canvas.height = Math.max(1, Math.round(v.videoHeight * scale))
                canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
                const frame = { src: canvas.toDataURL('image/jpeg', 0.82), aspect: v.videoWidth / v.videoHeight }
                clearTimeout(timer)
                done(() => resolve(frame))
            } catch (e) {
                clearTimeout(timer)
                done(() => reject(e instanceof Error ? e : new Error(String(e))))
            }
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
