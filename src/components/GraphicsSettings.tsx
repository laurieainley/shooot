import { useMemo } from 'react'
import { selectMatchStartSec, useAppState } from '../state'
import type { GraphicsSettings as Settings } from '../graphics/plan'
import { graphicsSupport } from '../utils/capabilities'
import { estimateReencode, reelSummary } from '../utils/reel'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

const OPTIONS: { key: keyof Settings; label: string; hint: string }[] = [
    { key: 'cards', label: 'Title & full-time cards', hint: 'VS card before, final score after' },
    { key: 'lowerThirds', label: 'Event captions', hint: 'Top left for 5 s: goals, penalties, highlights with a note' },
    { key: 'replayTag', label: 'Replay tag', hint: 'Small “REPLAY” top right on slow-motion replays' },
    { key: 'scoreBug', label: 'Score always on screen', hint: 'Score bug top left on every frame' },
]

/** Export panel switches for the match graphics drawn into the rendered reel. */
export function GraphicsSettings() {
    const graphics = useAppState((s) => s.graphics)
    const setGraphics = useAppState((s) => s.setGraphics)
    const events = useAppState((s) => s.events)
    const files = useAppState((s) => s.files)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartSec = useAppState(selectMatchStartSec)
    const adjust = useAppState((s) => s.adjustTimestampsByOffset)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const replayBeforeSec = useAppState((s) => s.replayBeforeSec)
    const replayAfterSec = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)
    const measured = useAppState((s) => s.reencodeSecPerSec)
    const phone = useMediaQuery(COARSE_QUERY)
    const support = useMemo(() => graphicsSupport(globalThis as unknown as Record<string, unknown>), [])

    const reelSec = useMemo(() => reelSummary({
        events, cumulativeOffsets, durationsSec: files.map((f) => f.durationSec ?? Infinity), matchStartSec, adjustTimestampsByOffset: adjust,
        before, after, replay: { beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed },
    }).seconds, [events, cumulativeOffsets, files, matchStartSec, adjust, before, after, replayBeforeSec, replayAfterSec, replaySpeed])

    return (
        <div className="flex flex-col">
            {!support.ok && <p role="note" className="export-note">{support.message}</p>}
            {OPTIONS.map((o) => (
                <label key={o.key} className="toggle-row">
                    <input type="checkbox" disabled={!support.ok} checked={support.ok && !!graphics[o.key]} onChange={(e) => setGraphics({ [o.key]: e.target.checked })} />
                    <span className="toggle-row__text">
                        {o.label}
                        <span className="toggle-row__hint">{o.hint}</span>
                    </span>
                </label>
            ))}
            {support.ok && graphics.scoreBug && (
                <p role="note" className="export-note">
                    Re-encodes the whole reel, {estimateReencode(reelSec, measured, phone)} on this device (plain reels are copied, not re-encoded).
                </p>
            )}
        </div>
    )
}
