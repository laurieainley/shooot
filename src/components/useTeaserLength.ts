import { useMemo } from 'react'
import { useAppState } from '../state'
import { linkedEvents } from '../utils/relink'
import { hasMark, isMarker } from '../utils/eventTypes'
import { teaserLength } from '../utils/teaser'

/** The starred moments and the length of the teaser's own cuts (their teaser replays included), for the Export panel (whether or not the teaser is switched on). */
export function useTeaserLength(): { moments: number; seconds: number; unloaded: boolean } {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const replayBefore = useAppState((s) => s.replayBeforeSec)
    const replayAfter = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)
    return useMemo(() => {
        // Teaser replays count at the match's replay window and speed (framing does not change the length).
        const replay = { beforeSec: replayBefore, afterSec: replayAfter, speed: replaySpeed }
        const t = teaserLength({ events: linkedEvents(events), cumulativeOffsets, durationsSec: files.map((f) => f.durationSec ?? Infinity), before, after, replay })
        // Starred events exist, but none is in a loaded file.
        return { ...t, unloaded: t.moments === 0 && events.some((e) => !isMarker(e) && hasMark(e, 'teaser')) }
    }, [events, cumulativeOffsets, files, before, after, replayBefore, replayAfter, replaySpeed])
}
