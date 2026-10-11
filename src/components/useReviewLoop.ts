import { useEffect } from 'react'
import { useAppState } from '../state'
import { globalToFileTime } from '../utils/matchStrip'
import { AUDIO_DETECT } from '../detect/detectConfig'

/** Plays [t − 3 s, t + 2 s] around the suggestion at `timeSec` (whole timeline) and jumps back to its start at the end. */
export function useReviewLoop(timeSec: number | null): void {
    useEffect(() => {
        if (timeSec === null) return
        const st = useAppState.getState()
        const durations = st.files.map((f) => f.durationSec ?? 0)
        const startAbs = Math.max(0, timeSec + AUDIO_DETECT.reviewWindowSec[0]), endAbs = timeSec + AUDIO_DETECT.reviewWindowSec[1]
        const start = globalToFileTime(st.cumulativeOffsets, durations, startAbs)
        st.seekToGoal(start.fileIndex, start.timeSec)
        return useAppState.subscribe((s, prev) => {
            if (s.currentTimeInFileSec === prev.currentTimeInFileSec && s.currentFileIndex === prev.currentFileIndex) return
            const now = (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec
            if (now >= endAbs) s.seekToGoal(start.fileIndex, start.timeSec)
        })
    }, [timeSec])
}
