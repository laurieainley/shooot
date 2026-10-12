import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { LoopWindow } from '../utils/reviewLoop'
import { timeAtPosition, timelineLayout, windowTicks, type LabelAlign } from '../utils/reviewMark'
import { EventIcon } from './icons/EventIcon'

interface ReviewTimelineProps {
    window: LoopWindow
    estimateSec: number
    playheadSec: number
    markedSec: number | null
    /** Formats a whole-timeline second as a match clock with tenths. */
    format: (sec: number) => string
    /** Click / drag: scrub to this whole-timeline second (pauses; marks nothing). */
    onScrub: (sec: number) => void
    /** Handles at the ends of the bar extend the loop window by 2 s. */
    onEarlier: () => void
    onLater: () => void
}

const ALIGN: Record<LabelAlign, string> = { start: '6px', center: '-50%', end: 'calc(-100% - 6px)' }

/** Mini timeline for the review loop: progress fill, red playhead with the time, estimate ring, marked pin. */
export function ReviewTimeline({ window: w, estimateSec, playheadSec, markedSec, format, onScrub, onEarlier, onLater }: ReviewTimelineProps) {
    const barRef = useRef<HTMLDivElement | null>(null)
    const dragging = useRef(false)
    const l = timelineLayout(w, estimateSec, playheadSec, markedSec)
    const pct = (f: number): string => `${f * 100}%`
    const scrub = (e: ReactPointerEvent<HTMLDivElement>): void => {
        const r = barRef.current?.getBoundingClientRect()
        if (!r || r.width <= 0) return
        onScrub(timeAtPosition((e.clientX - r.left) / r.width, w))
    }
    const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
        dragging.current = true
        try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* not capturable */ }
        scrub(e)
    }
    return (
        <div className="rtl">
            <div ref={barRef} className="rtl__bar" role="slider" tabIndex={0} aria-label="Position in the clip"
                aria-valuemin={Math.round(w.startAbs)} aria-valuemax={Math.round(w.endAbs)} aria-valuenow={Math.round(playheadSec)} aria-valuetext={format(playheadSec)}
                onPointerDown={down} onPointerMove={(e) => { if (dragging.current) scrub(e) }}
                onPointerUp={() => { dragging.current = false }} onPointerCancel={() => { dragging.current = false }}>
                <div className="rtl__fill" style={{ width: pct(l.fill) }} />
                {windowTicks(w).map((t, i) => <span key={i} className={`rtl__tick${t.major ? ' rtl__tick--major' : ''}`} style={{ left: pct(t.frac) }} />)}
                <span className="rtl__estimate" style={{ left: pct(l.estimate.frac) }} data-testid="rtl-estimate" />
                {l.marked && (
                    <span className="rtl__pin" style={{ left: pct(l.marked.frac) }} data-testid="rtl-marked">
                        <EventIcon event={{ type: 'goal' }} size={26} decorative />
                    </span>
                )}
                <span className="rtl__playhead" style={{ left: pct(l.playhead.frac) }} data-testid="rtl-playhead" />
            </div>
            <div className="rtl__labels" aria-hidden="true">
                <span className="rtl__label" style={{ left: pct(l.estimate.frac), transform: `translateX(${ALIGN[l.estimate.align]})` }}>estimate</span>
                {l.marked && <span className="rtl__label rtl__label--marked" style={{ left: pct(l.marked.frac), transform: `translateX(${ALIGN[l.marked.align]})` }}>marked</span>}
            </div>
            <div className="rtl__ends tc">
                <button type="button" className="rtl__handle" aria-label="Start 2 seconds earlier" title="Shortcut: {" onClick={onEarlier}>+2 s</button>
                <span>{format(w.startAbs)}</span>
                <span className="rtl__gap" />
                <span>{format(w.endAbs)}</span>
                <button type="button" className="rtl__handle" aria-label="End 2 seconds later" title="Shortcut: }" onClick={onLater}>+2 s</button>
            </div>
        </div>
    )
}
