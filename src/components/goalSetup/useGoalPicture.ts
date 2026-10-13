import { useEffect, useState } from 'react'
import { thumbnailTimes } from '../../utils/goalSetup'
import { grabFrame, useFrameAt, useStillAt, type Frame, type FrameState } from '../frameGrab'

const STILL_WIDTH = 3840
const SCRUB_WIDTH = 960
const THUMB_WIDTH = 240
const SCRUB_DEBOUNCE_MS = 150

/**
 * The picture the goals are set up on: a quick frame from the middle of the video; while choosing, a 960 px frame of
 * the picked moment (debounced while scrubbing); from step 1 on, the full-resolution still of that moment.
 */
export function useGoalPicture(url: string | undefined, duration: number, time: number, sharp: boolean): FrameState {
    const quick = useFrameAt(url, duration ? duration / 2 : null)
    const [grabTime, setGrabTime] = useState(time)
    useEffect(() => {
        const t = setTimeout(() => setGrabTime(time), SCRUB_DEBOUNCE_MS)
        return () => clearTimeout(t)
    }, [time])
    const at = duration ? grabTime : null
    const scrub = useStillAt(sharp ? null : url, at, SCRUB_WIDTH)
    const still = useStillAt(sharp ? url : null, at, STILL_WIDTH)
    const best = (sharp ? still.frame : null) ?? scrub.frame ?? quick.frame
    const status = sharp ? still.status : scrub.status
    return { status: best && status === 'error' ? 'ready' : status === 'idle' ? quick.status : status, frame: best }
}

export type Thumb = { time: number; frame: Frame | null }

/** Small frames spread over the video, grabbed lazily one after another so a phone never decodes several at once. */
export function useThumbnails(url: string | undefined, duration: number, enabled: boolean): Thumb[] {
    const times = url && duration && enabled ? thumbnailTimes(duration) : []
    const key = times.length ? `${url}|${duration}` : ''
    const [state, setState] = useState<{ key: string; frames: (Frame | null)[] }>({ key: '', frames: [] })
    useEffect(() => {
        if (!key || !url) return
        let live = true
        const run = async (): Promise<void> => {
            const frames: (Frame | null)[] = []
            for (const t of thumbnailTimes(duration)) {
                let f: Frame | null = null
                try { f = await grabFrame(url, t, THUMB_WIDTH) } catch { f = null }
                if (!live) return
                frames.push(f)
                setState({ key, frames: [...frames] })
            }
        }
        void run()
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    const frames = state.key === key ? state.frames : []
    return times.map((time, i) => ({ time, frame: frames[i] ?? null }))
}
