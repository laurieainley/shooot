import { useId, useMemo, useState } from 'react'
import { selectMatchStartSec, useAppState } from '../state'
import { clipSettingsLine, formatReelLength, reelSummary } from '../utils/reel'
import { ClipSettings } from './ClipSettings'

/** Export panel → Reel: length and clip count of the reel, a one-line recap of the clip / replay settings, and an Edit disclosure that reveals them. */
export function ReelSummary() {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartSec = useAppState(selectMatchStartSec)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const replayBeforeSec = useAppState((s) => s.replayBeforeSec)
    const replayAfterSec = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)
    const [editing, setEditing] = useState(false)
    const panelId = useId()

    const reel = useMemo(() => reelSummary({
        events, cumulativeOffsets, durationsSec: files.map((f) => f.durationSec ?? Infinity), matchStartSec, adjustTimestampsByOffset,
        before, after, replay: { beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed },
    }), [events, cumulativeOffsets, files, matchStartSec, adjustTimestampsByOffset, before, after, replayBeforeSec, replayAfterSec, replaySpeed])

    return (
        <div role="group" aria-label="Reel summary" className="reel-summary">
            <p className="reel-summary__length m-0">
                <b className="tc">{formatReelLength(reel.seconds)}</b>
                <span> · {reel.clips} {reel.clips === 1 ? 'clip' : 'clips'}</span>
            </p>
            <p className="reel-summary__settings m-0">
                {clipSettingsLine({ before, after, replayBeforeSec, replayAfterSec, replaySpeed })}
                {' '}
                <button type="button" className="link-btn" aria-expanded={editing} aria-controls={panelId} onClick={() => setEditing((v) => !v)}>
                    {editing ? 'Done' : 'Edit'}
                </button>
            </p>
            {editing && <div id={panelId} className="reel-summary__editor"><ClipSettings /></div>}
        </div>
    )
}
