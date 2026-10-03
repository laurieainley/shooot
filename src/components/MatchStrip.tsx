import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useAppState } from '../state'
import { buildMatchStrip, globalToFileTime } from '../utils/matchStrip'
import { formatEventClock, formatHMS } from '../utils/timeline'

/** Whole-match overview: every file end to end, clip spans, event dots, kick-off flag and playhead. Click or drag to jump. */
export function MatchStrip() {
    const files = useAppState((s) => s.files)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const matchStartSec = useAppState((s) => s.matchStartTimeSec)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const currentTimeSec = useAppState((s) => s.currentTimeInFileSec)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewCount = useAppState((s) => s.previewSegments.length)
    const previewIndex = useAppState((s) => s.currentPreviewSegment)
    const dragging = useRef(false)

    const strip = useMemo(
        () => buildMatchStrip({ files, cumulativeOffsets, events, teams, matchStartSec, currentFileIndex, currentTimeSec, before, after }),
        [files, cumulativeOffsets, events, teams, matchStartSec, currentFileIndex, currentTimeSec, before, after],
    )
    const durations = files.map((f) => f.durationSec ?? 0)
    const absNow = (cumulativeOffsets[currentFileIndex] ?? 0) + currentTimeSec

    const seekAt = (ev: ReactPointerEvent<HTMLDivElement>): void => {
        const rect = ev.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return
        const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
        const { fileIndex, timeSec } = globalToFileTime(cumulativeOffsets, durations, frac * strip.totalSec)
        useAppState.getState().seekToGoal(fileIndex, Math.round(timeSec * 10) / 10)
    }

    return (
        <div className="match-strip">
            <div className="strip-label">
                {isPreviewMode ? (
                    <>
                        <span className="strip-label__clock strip-label__clock--accent tc">Preview</span>
                        <span className="tc">{previewIndex + 1}/{previewCount}</span>
                    </>
                ) : (
                    <>
                        <span className="strip-label__clock tc">{formatEventClock(absNow, currentTimeSec, matchStartSec)}</span>
                        <span className="tc">{files.length > 0 ? `V${currentFileIndex + 1}/${files.length}` : '—'}</span>
                    </>
                )}
            </div>
            {strip.totalSec > 0 && (
                <div
                    role="slider"
                    aria-label="Match timeline"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(strip.totalSec)}
                    aria-valuenow={Math.round(absNow)}
                    aria-valuetext={formatHMS(absNow)}
                    className="strip-track"
                    onPointerDown={(ev) => {
                        if ((ev.target as HTMLElement).closest('button')) return
                        dragging.current = true
                        ev.currentTarget.setPointerCapture?.(ev.pointerId)
                        seekAt(ev)
                    }}
                    onPointerMove={(ev) => { if (dragging.current) seekAt(ev) }}
                    onPointerUp={() => { dragging.current = false }}
                    onPointerCancel={() => { dragging.current = false }}
                >
                    {strip.files.map((f, i) => (
                        <div key={`${f.name}-${i}`} className={`strip-file${i === currentFileIndex ? ' strip-file--current' : ''}`} style={{ left: `${f.leftPct}%`, width: `${f.widthPct}%` }}>
                            <span className="strip-file__name tc">{f.name}</span>
                        </div>
                    ))}
                    {strip.clips.map((c, i) => (
                        <div key={i} className="strip-clip" style={{ left: `${c.leftPct}%`, width: `max(${c.widthPct}%, 3px)` }} />
                    ))}
                    {strip.startPct !== null && (
                        <div className="strip-flag" title="Kick-off" style={{ left: `${strip.startPct}%` }} />
                    )}
                    {strip.events.map((e) => (
                        <button
                            key={e.id}
                            type="button"
                            className="strip-dot"
                            aria-label={e.title}
                            title={e.title}
                            style={{ left: `${e.leftPct}%`, background: e.color }}
                            onClick={() => {
                                const st = useAppState.getState()
                                const ev = st.events.find((x) => x.id === e.id)
                                if (ev) st.seekToGoal(ev.sourceFileIndex ?? 0, Math.max(0, ev.matchTimeSec - st.lengthBeforeGoalSec))
                            }}
                        />
                    ))}
                    <div className="strip-head" style={{ left: `${strip.playheadPct}%` }} />
                </div>
            )}
        </div>
    )
}
