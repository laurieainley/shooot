import { useMemo } from 'react'
import { useAppState } from '../state'
import { formatReelLength, reelSummary } from '../utils/reel'

/** Rail footer: clip padding, replay window and reel length at a glance (read-only; edit in ⋯ → Advanced settings). */
export function ClipSummary() {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartSec = useAppState((s) => s.matchStartTimeSec)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const replayBeforeSec = useAppState((s) => s.replayBeforeSec)
    const replayAfterSec = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)

    const reel = useMemo(() => reelSummary({
        events, cumulativeOffsets, durationsSec: files.map((f) => f.durationSec ?? Infinity), matchStartSec, adjustTimestampsByOffset,
        before, after, replay: { beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed },
    }), [events, cumulativeOffsets, files, matchStartSec, adjustTimestampsByOffset, before, after, replayBeforeSec, replayAfterSec, replaySpeed])

    return (
        <div role="group" aria-label="Clip summary" className="clip-summary">
            <span className="kv"><span>Clip</span><b className="tc">−{before}s / +{after}s</b></span>
            <span className="kv"><span>Replay</span><b className="tc">−{replayBeforeSec}s / +{replayAfterSec}s · {replaySpeed}×</b></span>
            <span className="kv"><span>Reel</span><b className="tc">{formatReelLength(reel.seconds)} · {reel.clips} {reel.clips === 1 ? 'clip' : 'clips'}</b></span>
        </div>
    )
}
