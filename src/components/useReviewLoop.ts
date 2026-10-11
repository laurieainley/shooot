import { setReviewWindow } from './reviewWindowState'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppState } from '../state'
import { globalToFileTime } from '../utils/matchStrip'
import { REVIEW_STEP_SEC, reviewWindow, stepLoop, type LoopState, type LoopWindow } from '../utils/reviewLoop'
import { isPlayerPaused } from './playerControl'
import { AUDIO_DETECT } from '../detect/detectConfig'

export interface ReviewLoop {
    window: LoopWindow | null
    earlier: () => void
    later: () => void
}

/**
 * Plays the review window around the suggestion at `timeSec` (whole timeline; default −5 s → +4 s) and jumps back to
 * its start at the end, until the user seeks elsewhere. `earlier` / `later` extend the window by 2 s per press; it
 * resets when the suggestion changes.
 */
export function useReviewLoop(timeSec: number | null): ReviewLoop {
    const [ext, setExt] = useState<{ key: number | null; before: number; after: number }>({ key: timeSec, before: 0, after: 0 })
    const cur = ext.key === timeSec ? ext : { key: timeSec, before: 0, after: 0 }
    const durations = useAppState((s) => s.files.map((f) => f.durationSec ?? 0).join(','))
    const totalSec = useMemo(() => durations.split(',').reduce((a, b) => a + (Number(b) || 0), 0), [durations])
    const win = useMemo(
        () => (timeSec === null ? null : reviewWindow(timeSec, AUDIO_DETECT.reviewWindowSec, cur.before, cur.after, totalSec)),
        [timeSec, cur.before, cur.after, totalSec],
    )
    const winRef = useRef(win)
    winRef.current = win
    const startAbs = win?.startAbs ?? null
    useEffect(() => {
        setReviewWindow(win)
        return () => setReviewWindow(null)
    }, [win])

    const earlier = useCallback((): void => {
        if (timeSec === null) return
        setExt((p) => {
            const c = p.key === timeSec ? p : { key: timeSec, before: 0, after: 0 }
            const maxBefore = Math.max(0, timeSec + AUDIO_DETECT.reviewWindowSec[0])
            return c.before >= maxBefore ? c : { ...c, before: Math.min(c.before + REVIEW_STEP_SEC, maxBefore) }
        })
    }, [timeSec])
    const later = useCallback((): void => {
        if (timeSec === null) return
        setExt((p) => {
            const c = p.key === timeSec ? p : { key: timeSec, before: 0, after: 0 }
            const w = reviewWindow(timeSec, AUDIO_DETECT.reviewWindowSec, c.before, c.after, totalSec)
            return totalSec > 0 && w.endAbs >= totalSec ? c : { ...c, after: c.after + REVIEW_STEP_SEC }
        })
    }, [timeSec, totalSec])

    useEffect(() => {
        if (timeSec === null || startAbs === null) return
        const st = useAppState.getState()
        const durs = st.files.map((f) => f.durationSec ?? 0)
        const start = globalToFileTime(st.cumulativeOffsets, durs, startAbs)
        let state: LoopState = { released: false, seekingSince: Date.now() }
        st.seekToGoal(start.fileIndex, start.timeSec)
        return useAppState.subscribe((s, prev) => {
            if (s.currentTimeInFileSec === prev.currentTimeInFileSec && s.currentFileIndex === prev.currentFileIndex) return
            if (isPlayerPaused()) return // paused: the user is fine-tuning; looping resumes on play
            const w = winRef.current
            if (!w) return
            const now = (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec
            const r = stepLoop(state, now, w, Date.now())
            state = r.state
            if (r.loop) s.seekToGoal(start.fileIndex, start.timeSec)
        })
    }, [timeSec, startAbs])

    return { window: win, earlier, later }
}
