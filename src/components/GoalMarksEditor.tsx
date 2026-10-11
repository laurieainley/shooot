import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { GoalMarks, GoalTeam, Pt } from '../types'
import { footprint } from '../utils/goalMarks'
import { MARK_STEPS, isComplete, nextStep, promptFor, type MarkKey } from '../utils/goalMarkSteps'
import { wheelZoomFactor } from '../utils/zoom'
import type { FrameState } from './frameGrab'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'
import { useZoomPan } from './useZoomPan'

interface GoalMarksEditorProps {
    team: GoalTeam
    frame: FrameState
    initial: GoalMarks | null
    onDone: (marks: GoalMarks) => void
    onCancel: () => void
}

const LABELS: Record<MarkKey, string> = {
    postL: 'Left post bottom',
    postR: 'Right post bottom',
    barL: 'Left post top',
    barR: 'Right post top',
    backL: 'Back-left corner',
    backR: 'Back-right corner',
}
const NUDGE = 0.002
const NUDGE_BIG = 0.01
const DONE_TEXT = 'All set — drag a dot to adjust.'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const line = (a: Pt, b: Pt): string => `M${a.x} ${a.y}L${b.x} ${b.y}`

/**
 * Mark a goal on the Match setup still: bottom of both posts, top of both posts, and (optionally) the back corners
 * of the net on the floor. Click or tap to place each point in turn, drag a dot to adjust it. Wheel / pinch zooms,
 * space+drag or two fingers pan.
 */
export function GoalMarksEditor({ team, frame, initial, onDone, onCancel }: GoalMarksEditorProps) {
    const touch = useMediaQuery(COARSE_QUERY)
    const [partial, setPartial] = useState<Partial<GoalMarks>>(initial ?? {})
    const [skipped, setSkipped] = useState<ReadonlySet<MarkKey>>(() => new Set(initial && !initial.backL ? (['backL', 'backR'] as MarkKey[]) : []))
    const viewport = useRef<HTMLDivElement | null>(null)
    const picture = useRef<HTMLDivElement | null>(null)
    const space = useRef(false)
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const gesture = useRef<{ dist: number; zoom: number } | null>(null)
    const panned = useRef(false)
    const dragging = useRef<MarkKey | null>(null)
    const zp = useZoomPan(() => {
        const r = viewport.current?.getBoundingClientRect()
        return { width: r?.width || 1, height: r?.height || 1 }
    })
    const zpRef = useRef(zp)
    zpRef.current = zp

    // Wheel needs a non-passive listener to stop the page scrolling.
    useEffect(() => {
        const el = viewport.current
        if (!el) return
        const onWheel = (e: WheelEvent): void => {
            e.preventDefault()
            const r = el.getBoundingClientRect()
            zpRef.current.zoomAt(wheelZoomFactor(e.deltaY), { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) })
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [frame.frame])

    const current = nextStep(partial, skipped)
    const step = MARK_STEPS.find((s) => s.key === current)

    const toFraction = (clientX: number, clientY: number): Pt => {
        const r = picture.current?.getBoundingClientRect()
        const w = r?.width || 1, h = r?.height || 1
        return { x: clamp01((clientX - (r?.left ?? 0)) / w), y: clamp01((clientY - (r?.top ?? 0)) / h) }
    }
    const place = (key: MarkKey, p: Pt): void => setPartial((m) => ({ ...m, [key]: p }))

    const onPictureClick = (e: React.MouseEvent<HTMLDivElement>): void => {
        if (panned.current) { panned.current = false; return }
        if (!current || space.current) return
        place(current, toFraction(e.clientX, e.clientY))
    }

    const dist = (): number => {
        const [a, b] = [...pointers.current.values()]
        return Math.hypot(a.x - b.x, a.y - b.y) || 1
    }
    const viewDown = (e: PointerEvent<HTMLDivElement>): void => {
        if (dragging.current) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2) { gesture.current = { dist: dist(), zoom: zp.zoom }; panned.current = true }
    }
    const viewMove = (e: PointerEvent<HTMLDivElement>): void => {
        const prev = pointers.current.get(e.pointerId)
        if (!prev) return
        const next = { x: e.clientX, y: e.clientY }
        pointers.current.set(e.pointerId, next)
        if (pointers.current.size >= 2 && gesture.current) {
            zp.panBy((next.x - prev.x) / 2, (next.y - prev.y) / 2)
            zp.pinchTo(gesture.current.zoom * (dist() / gesture.current.dist))
        } else if (space.current) {
            panned.current = true
            zp.panBy(next.x - prev.x, next.y - prev.y)
        }
    }
    const viewUp = (e: PointerEvent<HTMLDivElement>): void => {
        if (!pointers.current.delete(e.pointerId)) return
        if (gesture.current && pointers.current.size < 2) { gesture.current = null; zp.pinchEnd() }
    }
    const viewKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === ' ' && e.target === e.currentTarget) { space.current = true; e.preventDefault(); e.stopPropagation() }
    }
    const viewKeyUp = (e: KeyboardEvent<HTMLDivElement>): void => { if (e.key === ' ') space.current = false }

    const dotDown = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        e.stopPropagation()
        if (space.current) return
        dragging.current = key
        e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    const dotMove = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        if (dragging.current !== key) return
        place(key, toFraction(e.clientX, e.clientY))
    }
    const dotUp = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        if (dragging.current !== key) return
        dragging.current = null
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        panned.current = true // the click that follows a drag must not place a point
        setTimeout(() => { panned.current = false }, 0)
    }
    const dotKey = (key: MarkKey) => (e: KeyboardEvent<HTMLButtonElement>): void => {
        const p = partial[key]
        if (!p) return
        const d = e.shiftKey ? NUDGE_BIG : NUDGE
        const delta = e.key === 'ArrowLeft' ? [-d, 0] : e.key === 'ArrowRight' ? [d, 0] : e.key === 'ArrowUp' ? [0, -d] : e.key === 'ArrowDown' ? [0, d] : null
        if (!delta) return
        e.preventDefault()
        e.stopPropagation()
        place(key, { x: clamp01(p.x + delta[0]), y: clamp01(p.y + delta[1]) })
    }

    const skip = (): void => { if (current) setSkipped((s) => new Set([...s, current])) }
    const done = (): void => {
        if (!isComplete(partial)) return
        const { postL, postR, barL, barR, backL, backR } = partial
        onDone(backL && backR ? { postL, postR, barL, barR, backL, backR } : { postL, postR, barL, barR })
    }

    const pts = partial
    const poly = pts.postL && pts.postR && pts.barL && pts.barR ? footprint(pts as GoalMarks) : null
    const aspect = frame.frame?.aspect ?? 16 / 9

    return (
        <div className={`goal-marks goal-marks--${team}`}>
            <p className="goal-marks__prompt" role="status">{current ? promptFor(current, touch) : DONE_TEXT}</p>
            <div
                ref={viewport}
                className="goal-marks__view"
                style={{ aspectRatio: String(aspect) }}
                tabIndex={0}
                aria-label="Goal picture"
                onPointerDown={viewDown}
                onPointerMove={viewMove}
                onPointerUp={viewUp}
                onPointerCancel={viewUp}
                onKeyDown={viewKeyDown}
                onKeyUp={viewKeyUp}
            >
                {frame.frame ? (
                    <div
                        ref={picture}
                        className="goal-marks__picture"
                        data-testid="goal-marks-picture"
                        style={{ transform: `translate(${zp.pan.x}px, ${zp.pan.y}px) scale(${zp.zoom})` }}
                        onClick={onPictureClick}
                    >
                        <img className="goal-marks__img" src={frame.frame.src} alt="" draggable={false} />
                        <svg className="goal-marks__svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                            {poly && <polygon className="goal-marks__foot" points={poly.map((p) => `${p.x},${p.y}`).join(' ')} />}
                            {pts.postL && pts.barL && <path className="goal-marks__stroke" d={line(pts.postL, pts.barL)} />}
                            {pts.postR && pts.barR && <path className="goal-marks__stroke" d={line(pts.postR, pts.barR)} />}
                            {pts.barL && pts.barR && <path className="goal-marks__stroke" d={line(pts.barL, pts.barR)} />}
                            {pts.postL && pts.postR && <path className="goal-marks__stroke goal-marks__stroke--base" d={line(pts.postL, pts.postR)} />}
                        </svg>
                        {MARK_STEPS.map(({ key }) => {
                            const p = pts[key]
                            if (!p) return null
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className="goal-marks__dot"
                                    aria-label={LABELS[key]}
                                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={dotDown(key)}
                                    onPointerMove={dotMove(key)}
                                    onPointerUp={dotUp(key)}
                                    onPointerCancel={dotUp(key)}
                                    onKeyDown={dotKey(key)}
                                />
                            )
                        })}
                    </div>
                ) : <p className="frame-boxes__empty" role="status">{frame.status === 'loading' ? 'Loading a frame…' : 'No picture available for this video here.'}</p>}
            </div>
            <div className="goal-areas__row">
                {step?.optional && <button type="button" className="btn-quiet" onClick={skip}>Skip</button>}
                <button type="button" className="btn-quiet" onClick={zp.reset}>Reset zoom</button>
                <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
                <button type="button" className="btn-primary" disabled={!isComplete(partial)} onClick={done}>Done</button>
            </div>
        </div>
    )
}
