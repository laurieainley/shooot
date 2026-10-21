import { useMemo } from 'react'
import { useAppState } from '../state'
import { formatReelLength, reelSummary } from '../utils/reel'
import { formatScore, finalScore } from '../utils/score'
import { UpdateScoreLink } from './UpdateScoreLink'
import { scoreGap } from '../utils/scoreGap'

/** Export panel → Highlights summary: length and clip count of the reel, and a quiet note when the tagged score differs from the known final score. */
export function ReelSummary() {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const replayBeforeSec = useAppState((s) => s.replayBeforeSec)
    const replayAfterSec = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)
    const teams = useAppState((s) => s.teams)
    const known = useAppState((s) => s.knownFinalScore)

    const reel = useMemo(() => reelSummary({
        events, cumulativeOffsets, durationsSec: files.map((f) => f.durationSec ?? Infinity),
        before, after, replay: { beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed },
    }), [events, cumulativeOffsets, files, before, after, replayBeforeSec, replayAfterSec, replaySpeed])

    const tagged = finalScore(events, teams)
    const differs = known && teams.length >= 2 && !scoreGap(tagged, known)?.complete

    return (
        <div role="group" aria-label="Reel summary" className="reel-summary">
            <p className="reel-summary__length m-0">
                <b className="tc">{formatReelLength(reel.seconds)}</b>
                <span> reel · {reel.clips} {reel.clips === 1 ? 'clip' : 'clips'}</span>
            </p>
            {differs && known && <p className="reel-summary__settings m-0">Tagged {formatScore(tagged)}, final score {formatScore(known)}. <UpdateScoreLink /></p>}
        </div>
    )
}
