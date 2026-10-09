import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import { buildMatchStrip, globalToFileTime, stackLanes } from '../utils/matchStrip'
import { formatClock, formatEventClock } from '../utils/timeline'
import { EventIcon } from './icons/EventIcon'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

/** Icon size (px) on the strip: 16 with a mouse, 18 on touch. */
const ICON_MOUSE = 16
const ICON_TOUCH = 18

/** The track's width in px, kept up to date (icon stacking depends on it). */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(800)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const measure = (): void => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(w) }
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [ref])
    return width
}

/**
 * The timeline, and the only one: every file end to end, clip spans, event icons, kick-off / half-time / final-whistle flags,
 * the red playhead and the current time. Click or drag to seek (touch drags preview and seek on release), hover shows the time
 * under the pointer, Tab focuses it and ← / → seek like everywhere else.
 */
export function MatchStrip() {
    const files = useAppState((s) => s.files)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const matchStartSec = useAppState(selectMatchStartSec)
    const clockLong = useAppState(selectClockLong)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const currentTimeSec = useAppState((s) => s.currentTimeInFileSec)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewCount = useAppState((s) => s.previewSegments.length)
    const previewIndex = useAppState((s) => s.previewSteps[s.currentPreviewSegment]?.clipIndex ?? 0)
    const coarse = useMediaQuery(COARSE_QUERY)
    const dragging = useRef(false)
    const trackRef = useRef<HTMLDivElement | null>(null)
    const trackPx = useWidth(trackRef)
    // Pointer position as a fraction of the track: the hover / drag bubble, and (touch) the previewed playhead.
    const [pointerFrac, setPointerFrac] = useState<number | null>(null)
    const [touchDrag, setTouchDrag] = useState(false)

    const strip = useMemo(
        () => buildMatchStrip({ files, cumulativeOffsets, events, teams, currentFileIndex, currentTimeSec, before, after }),
        [files, cumulativeOffsets, events, teams, currentFileIndex, currentTimeSec, before, after],
    )
    const durations = files.map((f) => f.durationSec ?? 0)
    const absNow = (cumulativeOffsets[currentFileIndex] ?? 0) + currentTimeSec
    const iconPx = coarse ? ICON_TOUCH : ICON_MOUSE
    const lanes = useMemo(() => stackLanes(strip.events.map((e) => e.leftPct), trackPx, iconPx + 2), [strip.events, trackPx, iconPx])

    const fracAt = (ev: ReactPointerEvent<HTMLDivElement>): number | null => {
        const rect = ev.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return null
        return Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
    }
    const seekFrac = (frac: number): void => {
        const { fileIndex, timeSec } = globalToFileTime(cumulativeOffsets, durations, frac * strip.totalSec)
        useAppState.getState().seekToGoal(fileIndex, Math.round(timeSec * 10) / 10)
    }

    // The bubble: match clock (from kick-off) of the time under the pointer, and which file it is in.
    const bubble = pointerFrac === null || strip.totalSec <= 0 ? null : (() => {
        const t = pointerFrac * strip.totalSec
        const at = globalToFileTime(cumulativeOffsets, durations, t)
        return { clock: formatEventClock(t, at.timeSec, matchStartSec, clockLong), file: at.fileIndex + 1, pct: pointerFrac * 100 }
    })()
    const playheadPct = touchDrag && pointerFrac !== null ? pointerFrac * 100 : strip.playheadPct

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
                        <span className="strip-label__clock tc clock">{formatEventClock(absNow, currentTimeSec, matchStartSec, clockLong)}</span>
                        <span className="tc">{files.length > 0 ? `V${currentFileIndex + 1}/${files.length}` : '—'}</span>
                    </>
                )}
            </div>
            <div className="strip-wrap">
                {strip.totalSec > 0 && (
                    <div
                        ref={trackRef}
                        role="slider"
                        tabIndex={0}
                        aria-label="Match timeline"
                        aria-valuemin={0}
                        aria-valuemax={Math.round(strip.totalSec)}
                        aria-valuenow={Math.round(absNow)}
                        aria-valuetext={formatClock(absNow, clockLong)}
                        className="strip-track"
                        onPointerDown={(ev) => {
                            if ((ev.target as HTMLElement).closest('button')) return
                            dragging.current = true
                            ev.currentTarget.setPointerCapture?.(ev.pointerId)
                            const frac = fracAt(ev)
                            if (frac === null) return
                            setPointerFrac(frac)
                            if (ev.pointerType === 'touch') setTouchDrag(true)
                            else seekFrac(frac)
                        }}
                        onPointerMove={(ev) => {
                            const frac = fracAt(ev)
                            if (frac === null) return
                            if (ev.pointerType === 'touch' && !dragging.current) return
                            setPointerFrac(frac)
                            if (dragging.current && ev.pointerType !== 'touch') seekFrac(frac)
                        }}
                        onPointerUp={(ev) => {
                            if (dragging.current && ev.pointerType === 'touch') { const frac = fracAt(ev); if (frac !== null) seekFrac(frac) }
                            dragging.current = false
                            setTouchDrag(false)
                            if (ev.pointerType === 'touch') setPointerFrac(null)
                        }}
                        onPointerCancel={() => { dragging.current = false; setTouchDrag(false); setPointerFrac(null) }}
                        onPointerLeave={(ev) => { if (!dragging.current && ev.pointerType !== 'touch') setPointerFrac(null) }}
                    >
                        {strip.files.map((f, i) => (
                            <div key={`${f.name}-${i}`} className={`strip-file${i === currentFileIndex ? ' strip-file--current' : ''}`}
                                style={{ left: `${f.leftPct}%`, width: `${f.widthPct}%` }} title={f.name}>
                                <span className="strip-file__num tc">{i + 1}</span>
                                <span className="sr-only">{f.name}</span>
                            </div>
                        ))}
                        {strip.clips.map((c, i) => (
                            <div key={i} className="strip-clip" style={{ left: `${c.leftPct}%`, width: `max(${c.widthPct}%, 3px)` }} />
                        ))}
                        {strip.flags.map((f) => (
                            <div key={f.id} className={`strip-flag strip-flag--${f.kind}`} title={f.title} style={{ left: `${f.leftPct}%` }}>
                                <EventIcon event={{ type: f.kind }} size={13} />
                            </div>
                        ))}
                        {strip.events.map((e, i) => (
                            <button
                                key={e.id}
                                type="button"
                                className="strip-dot"
                                aria-label={e.title}
                                title={e.title}
                                data-lane={lanes[i]}
                                style={{ left: `${e.leftPct}%`, '--lane': lanes[i] } as React.CSSProperties}
                                onClick={() => {
                                    const st = useAppState.getState()
                                    const ev = st.events.find((x) => x.id === e.id)
                                    if (ev) st.seekToGoal(ev.sourceFileIndex ?? 0, Math.max(0, ev.matchTimeSec - st.lengthBeforeGoalSec))
                                }}
                            >
                                <EventIcon event={{ type: e.kind, pen: e.pen }} size={iconPx} decorative />
                            </button>
                        ))}
                        <div className="strip-head" style={{ left: `${playheadPct}%` }} />
                    </div>
                )}
                {bubble && (
                    <div className="strip-bubble tc" style={{ left: `${bubble.pct}%` }} aria-hidden="true">
                        {bubble.clock}<span className="strip-bubble__file"> · V{bubble.file}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
