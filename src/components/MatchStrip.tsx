import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import { buildMatchStrip, globalToFileTime, stackLanes } from '../utils/matchStrip'
import { formatClock, formatEventClock } from '../utils/timeline'
import { suggestionMarks } from '../utils/suggestions'
import { useSuggestionsCurrent } from './findGoals'
import { jumpToMoment } from './foundMoments'
import { useTagViewMode } from './tagView'
import { EventIcon } from './icons/EventIcon'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

/** Icon size (px) on the strip: 16 with a mouse, 18 on touch. */
const ICON_MOUSE = 16
const ICON_TOUCH = 18
/** A tap is under 6 px of movement and 300 ms; it opens a suggestion ring within reach (the rings themselves take no pointer events, so scrubbing over them still seeks). */
const TAP_MOVE_PX = 6
const TAP_MS = 300
// Only the ring itself counts: the ring's own size with a mouse, a 24 px target centred on it for touch / pen.
// The rings live in a thin lane at the bottom of the strip, so a click higher up never opens the review.
const RING_REACH_MOUSE_PX = 7
const RING_REACH_TOUCH_PX = 12
const RING_LANE_MOUSE_PX = 14
const RING_LANE_TOUCH_PX = 24
// Event icons (App.css .strip-dot): the button is the icon plus 8 px wide and 4 px high, its lane starts 11 px above the track floor
// and each lane adds a step. On touch / pen only the icon's own box counts for a tap.
const DOT_FLOOR_PX = 11
const laneStepPx = (coarse: boolean): number => (coarse ? 12 : 11)
/** A press from a finger or a pen (not a mouse). */
const isTouchLike = (type: string): boolean => type === 'touch' || type === 'pen'

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
interface MatchStripProps {
    /** overlay: the thin timeline along the bottom of the picture on touch (no clock label; the scorebug has the clock). */
    variant?: 'overlay'
}

export function MatchStrip({ variant }: MatchStripProps = {}) {
    const files = useAppState((s) => s.files)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const matchStartSec = useAppState(selectMatchStartSec)
    const suggestions = useAppState((s) => s.suggestions)
    const suggestionsCurrent = useSuggestionsCurrent()
    const touchView = useTagViewMode() !== 'off'
    // Touch: a ring jumps to the moment (6 s before, playing); there is no review card to open. Desktop opens the review.
    const openRing = (id: string): void => {
        const m = useAppState.getState().suggestions.find((x) => x.id === id)
        if (touchView && m) jumpToMoment(m)
        else useAppState.getState().openReviewAt(id)
    }
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
    const down = useRef<{ x: number; y: number; at: number } | null>(null)
    const lastTouchAt = useRef(-Infinity) // the click a tap on an icon leaves behind must not seek a second time
    const trackRef = useRef<HTMLDivElement | null>(null)
    const trackPx = useWidth(trackRef)
    // Pointer position as a fraction of the track: the hover / drag bubble, and (touch) the previewed playhead.
    const [pointerFrac, setPointerFrac] = useState<number | null>(null)
    const [touchDrag, setTouchDrag] = useState(false)
    // The symbol under a mouse pointer (event icon, marker flag icon or suggestion ring): its name goes in the bubble.
    const [hovered, setHovered] = useState<{ label: string; timeSec: number } | null>(null)

    const strip = useMemo(
        () => buildMatchStrip({ files, cumulativeOffsets, events, teams, currentFileIndex, currentTimeSec, before, after }),
        [files, cumulativeOffsets, events, teams, currentFileIndex, currentTimeSec, before, after],
    )
    const durations = files.map((f) => f.durationSec ?? 0)
    const absNow = (cumulativeOffsets[currentFileIndex] ?? 0) + currentTimeSec
    const iconPx = coarse ? ICON_TOUCH : ICON_MOUSE
    const marks = useMemo(
        () => (suggestionsCurrent ? suggestionMarks(suggestions, new Set(events.map((e) => e.id)), strip.totalSec) : []),
        [suggestions, events, strip.totalSec, suggestionsCurrent],
    )
    const lanes = useMemo(() => stackLanes(strip.events.map((e) => e.leftPct), trackPx, iconPx + 2), [strip.events, trackPx, iconPx])

    const fracAt = (ev: ReactPointerEvent<HTMLDivElement>): number | null => {
        const rect = ev.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return null
        return Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
    }
    /** The suggestion ring under the pointer: within reach of the ring, in the thin bottom lane. */
    const ringAt = (ev: ReactPointerEvent<HTMLDivElement>): (typeof marks)[number] | null => {
        if (marks.length === 0) return null
        const rect = ev.currentTarget.getBoundingClientRect()
        const touch = ev.pointerType === 'touch' || ev.pointerType === 'pen'
        const reach = touch ? RING_REACH_TOUCH_PX : RING_REACH_MOUSE_PX
        if (ev.clientY < rect.bottom - (touch ? RING_LANE_TOUCH_PX : RING_LANE_MOUSE_PX)) return null
        let best: { mark: (typeof marks)[number]; dist: number } | null = null
        for (const m of marks) {
            const dist = Math.abs(ev.clientX - (rect.left + (m.leftPct / 100) * rect.width))
            if (dist <= reach && (!best || dist < best.dist)) best = { mark: m, dist }
        }
        return best?.mark ?? null
    }
    /** The press that ends here was a tap (little movement, short), not a drag. Consumes the press. */
    const takeTap = (ev: ReactPointerEvent<HTMLDivElement>): boolean => {
        const d = down.current
        down.current = null
        return !!d && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < TAP_MOVE_PX && performance.now() - d.at < TAP_MS
    }
    /** The event whose icon box (the glyph itself, no extra margin) holds the pointer. Touch / pen taps only. */
    const iconAt = (ev: ReactPointerEvent<HTMLDivElement>): string | null => {
        const rect = ev.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return null
        const half = iconPx / 2
        for (let i = 0; i < strip.events.length; i++) {
            const e = strip.events[i]
            const cx = rect.left + (e.leftPct / 100) * rect.width
            const bottom = rect.bottom - (DOT_FLOOR_PX + lanes[i] * laneStepPx(coarse)) - 2
            if (Math.abs(ev.clientX - cx) <= half && ev.clientY <= bottom && ev.clientY >= bottom - iconPx) return e.id
        }
        return null
    }
    const jumpToEvent = (id: string): void => {
        const st = useAppState.getState()
        const ev = st.events.find((x) => x.id === id)
        if (ev && !st.jumpToPreviewEvent(ev.id)) st.seekToGoal(ev.sourceFileIndex ?? 0, Math.max(0, ev.matchTimeSec - st.lengthBeforeGoalSec))
    }
    /** Only the symbol itself names it: an event icon, a marker's flag icon (not its hairline) or a suggestion ring. */
    const symbolAt = (ev: ReactPointerEvent<HTMLDivElement>): { label: string; timeSec: number } | null => {
        const target = ev.target instanceof Element ? ev.target : null
        const dotId = target?.closest('.strip-dot')?.getAttribute('data-id')
        const dot = dotId ? strip.events.find((e) => e.id === dotId) : undefined
        if (dot) return dot
        const flagId = target?.closest('.strip-flag svg') ? target.closest('.strip-flag')?.getAttribute('data-id') : null
        const flag = flagId ? strip.flags.find((f) => f.id === flagId) : undefined
        if (flag) return flag
        const ring = ringAt(ev)
        return ring ? { label: ring.top ? 'Found moment (top pick)' : 'Found moment', timeSec: ring.timeSec } : null
    }
    const seekFrac = (frac: number): void => {
        const { fileIndex, timeSec } = globalToFileTime(cumulativeOffsets, durations, frac * strip.totalSec)
        useAppState.getState().seekToGoal(fileIndex, Math.round(timeSec * 10) / 10)
    }

    // The bubble: match clock (from kick-off) of the time under the pointer, and which file it is in. Over a symbol: its name,
    // and the symbol's own time and position.
    const bubble = pointerFrac === null || strip.totalSec <= 0 ? null : (() => {
        const t = hovered ? hovered.timeSec : pointerFrac * strip.totalSec
        const at = globalToFileTime(cumulativeOffsets, durations, t)
        return {
            label: hovered?.label ?? null,
            clock: formatEventClock(t, at.timeSec, matchStartSec, clockLong),
            file: at.fileIndex + 1,
            pct: Math.min(100, Math.max(0, (t / strip.totalSec) * 100)),
        }
    })()
    const playheadPct = touchDrag && pointerFrac !== null ? pointerFrac * 100 : strip.playheadPct

    return (
        <div className={`match-strip${variant ? ` match-strip--${variant}` : ''}`}>
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
                            // A mouse press on an icon (or ring) is that button's click; a finger or pen press never is: it scrubs.
                            if (!isTouchLike(ev.pointerType) && (ev.target as HTMLElement).closest('button')) return
                            if (isTouchLike(ev.pointerType)) lastTouchAt.current = performance.now()
                            dragging.current = true
                            down.current = { x: ev.clientX, y: ev.clientY, at: performance.now() }
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
                            setHovered(ev.pointerType === 'mouse' && !dragging.current ? symbolAt(ev) : null)
                            if (dragging.current && ev.pointerType !== 'touch') seekFrac(frac)
                        }}
                        onPointerUp={(ev) => {
                            const tap = dragging.current && takeTap(ev)
                            const ring = tap ? ringAt(ev)?.id ?? null : null
                            const icon = tap && !ring && isTouchLike(ev.pointerType) ? iconAt(ev) : null
                            if (ring) openRing(ring)
                            else if (icon) jumpToEvent(icon)
                            else if (dragging.current && ev.pointerType === 'touch') { const frac = fracAt(ev); if (frac !== null) seekFrac(frac) }
                            dragging.current = false
                            setTouchDrag(false)
                            if (ev.pointerType === 'touch') setPointerFrac(null)
                        }}
                        onPointerCancel={() => { dragging.current = false; down.current = null; setTouchDrag(false); setPointerFrac(null); setHovered(null) }}
                        onPointerLeave={(ev) => { if (!dragging.current && ev.pointerType !== 'touch') { setPointerFrac(null); setHovered(null) } }}
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
                            <div key={f.id} className={`strip-flag strip-flag--${f.kind}`} data-id={f.id} style={{ left: `${f.leftPct}%` }}>
                                <EventIcon event={{ type: f.kind }} size={13} />
                                <span className="sr-only">{f.title}</span>
                            </div>
                        ))}
                        {marks.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                className={`strip-suggestion${m.top ? ' strip-suggestion--top' : ''}`}
                                style={{ left: `${m.leftPct}%` }}
                                aria-label={`Found moment at ${formatEventClock(m.timeSec, m.timeSec, matchStartSec, clockLong)}`}
                                onClick={() => openRing(m.id)}
                            >
                                {m.top && <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 2.9l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.7l-5.4 3 1.1-6.1-4.5-4.3 6.1-.8z" /></svg>}
                            </button>
                        ))}
                        {strip.events.map((e, i) => (
                            <button
                                key={e.id}
                                type="button"
                                className="strip-dot"
                                aria-label={e.title}
                                data-id={e.id}
                                data-lane={lanes[i]}
                                style={{ left: `${e.leftPct}%`, '--lane': lanes[i] } as React.CSSProperties}
                                onClick={() => { if (performance.now() - lastTouchAt.current > 700) jumpToEvent(e.id) }}
                            >
                                <EventIcon event={{ type: e.kind, pen: e.pen }} size={iconPx} decorative />
                            </button>
                        ))}
                        <div className="strip-head" style={{ left: `${playheadPct}%` }} />
                    </div>
                )}
                {bubble && (
                    <div className="strip-bubble tc" style={{ left: `${bubble.pct}%` }} aria-hidden="true">
                        {bubble.label && <span className="strip-bubble__label">{bubble.label} · </span>}
                        {bubble.clock}<span className="strip-bubble__file"> · V{bubble.file}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
