import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state'
import { formatReelLength, reelSummary } from '../utils/reel'
import { ClipSettings } from './ClipSettings'
import { FloatingPanel } from './FloatingPanel'

/** Rail footer: clip padding, replay window and reel length at a glance; click to edit them. */
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
    const [open, setOpen] = useState(false)
    const anchorRef = useRef<HTMLButtonElement | null>(null)

    const reel = useMemo(() => reelSummary({
        events, cumulativeOffsets, durationsSec: files.map((f) => f.durationSec ?? Infinity), matchStartSec, adjustTimestampsByOffset,
        before, after, replay: { beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed },
    }), [events, cumulativeOffsets, files, matchStartSec, adjustTimestampsByOffset, before, after, replayBeforeSec, replayAfterSec, replaySpeed])

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                aria-label="Clip settings"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="clip-summary"
            >
                <span className="kv"><span>Clip</span><b className="tc">−{before}s / +{after}s</b></span>
                <span className="kv"><span>Replay</span><b className="tc">−{replayBeforeSec}s / +{replayAfterSec}s · {replaySpeed}×</b></span>
                <span className="kv"><span>Reel</span><b className="tc">{formatReelLength(reel.seconds)} · {reel.clips} {reel.clips === 1 ? 'clip' : 'clips'}</b></span>
            </button>
            {open && (
                <FloatingPanel label="Clip settings" anchorRef={anchorRef} placement="above" onClose={() => setOpen(false)} className="floating--narrow">
                    <ClipSettings />
                </FloatingPanel>
            )}
        </>
    )
}
