import { useMemo } from 'react'
import { useAppState } from '../state'
import { linkedEvents } from '../utils/relink'
import { hasMark, isMarker } from '../utils/eventTypes'
import { teaserLength } from '../utils/teaser'

/** The starred moments and the length of the teaser's own cuts, for the Export panel (whether or not the teaser is switched on). */
export function useTeaserLength(): { moments: number; seconds: number; unloaded: boolean } {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    return useMemo(() => {
        const t = teaserLength({ events: linkedEvents(events), cumulativeOffsets, durationsSec: files.map((f) => f.durationSec ?? Infinity), before, after })
        // Starred events exist, but none is in a loaded file.
        return { ...t, unloaded: t.moments === 0 && events.some((e) => !isMarker(e) && hasMark(e, 'teaser')) }
    }, [events, cumulativeOffsets, files, before, after])
}
