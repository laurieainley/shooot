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
const DRAG_START_PX = 6
const VIEW_LABEL = 'Goal picture. Use a mouse or touch to place points; arrow keys nudge the selected point.'
const HINT_FINE = 'Scroll or pinch to zoom · drag with two fingers, right button or Space to move'
const HINT_TOUCH = 'Pinch to zoom · drag with two fingers to move'

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
    const [skipped, setSkipped] = useState<ReadonlySet<MarkKey>>(() => new Set<MarkKey>())
    const root = useRef<HTMLDivElement | null>(null)
    const viewport = useRef<HTMLDivElement | null>(null)
    const picture = useRef<HTMLDivElement | null>(null)
    const space = useRef(false)
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const gesture = useRef<{ dist: number; zoom: number } | null>(null)
    const panned = useRef(false)
    const dragging = useRef<{ key: MarkKey; startX: number; startY: number; off: Pt } | null>(null)
    const rightPan = useRef(false)
    const dragMoved = useRef(false)
    const zp = useZoomPan(() => {
        const r = viewport.current?.getBoundingClientRect()
        return { width: r?.width || 1, height: r?.height || 1 }
    })
    const zpRef = useRef(zp)
    zpRef.current = zp

    // The editor replaces the boxes picture and is taller: bring it (prompt, picture, Done) into the sheet's view.
    useEffect(() => {
        root.current?.scrollIntoView?.({ block: 'start' })
        viewport.current?.focus({ preventScroll: true })
    }, [])

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
        // The picture box (with zoom / pan applied) holds the image letterboxed (object-fit: contain): measure inside it.
        const r = picture.current?.getBoundingClientRect()
        const bw = r?.width || 1, bh = r?.height || 1
        const aspect = frame.frame?.aspect ?? bw / bh
        const w = Math.min(bw, bh * aspect), h = Math.min(bh, bw / aspect)
        const left = (r?.left ?? 0) + (bw - w) / 2, top = (r?.top ?? 0) + (bh - h) / 2
        return { x: clamp01((clientX - left) / w), y: clamp01((clientY - top) / h) }
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
        if (e.button === 2) { rightPan.current = true; e.currentTarget.setPointerCapture?.(e.pointerId) }
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
        } else if (space.current || rightPan.current) {
            if (space.current) panned.current = true
            zp.panBy(next.x - prev.x, next.y - prev.y)
        }
    }
    const viewUp = (e: PointerEvent<HTMLDivElement>): void => {
        if (!pointers.current.delete(e.pointerId)) return
        if (pointers.current.size === 0) rightPan.current = false
        if (gesture.current && pointers.current.size < 2) { gesture.current = null; zp.pinchEnd() }
        // A pan / pinch swallows the click it ends with, but not the next genuine tap.
        if (pointers.current.size === 0 && panned.current) setTimeout(() => { panned.current = false }, 0)
    }
    const viewKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === ' ' && e.target === e.currentTarget) { space.current = true; e.preventDefault(); e.stopPropagation() }
        else if (e.key === 'Enter' && e.target === e.currentTarget && current) {
            // Keyboard placement: the point goes at the middle of what is in view.
            const r = e.currentTarget.getBoundingClientRect()
            e.preventDefault()
            e.stopPropagation()
            place(current, toFraction(r.left + r.width / 2, r.top + r.height / 2))
        }
    }
    const viewKeyUp = (e: KeyboardEvent<HTMLDivElement>): void => { if (e.key === ' ') space.current = false }

    const dotDown = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        if (e.button > 0) return // right-drag on a dot pans the picture
        e.stopPropagation()
        if (space.current) return
        const p = partial[key]
        const at = toFraction(e.clientX, e.clientY)
        dragging.current = { key, startX: e.clientX, startY: e.clientY, off: p ? { x: p.x - at.x, y: p.y - at.y } : { x: 0, y: 0 } }
        dragMoved.current = false
        e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    const dotMove = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        const d = dragging.current
        if (d?.key !== key) return
        // Under 6 px it is still a tap: jitter must not nudge the dot.
        if (!dragMoved.current && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_START_PX) return
        dragMoved.current = true
        const at = toFraction(e.clientX, e.clientY)
        place(key, { x: clamp01(at.x + d.off.x), y: clamp01(at.y + d.off.y) })
    }
    const dotUp = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        if (dragging.current?.key !== key) return
        dragging.current = null
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        if (!dragMoved.current) return
        panned.current = true // the click that follows a drag must not place a point
        setTimeout(() => { panned.current = false }, 0)
    }
    // A plain tap on a dot while a point is still to be placed places that point: the dots' 44 px targets overlap the
    // spot to tap next when the goal is small in the picture (a drag, or Enter on the dot, does not).
    const dotClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
        e.stopPropagation()
        if (dragMoved.current || e.detail === 0 || space.current || !current) return
        place(current, toFraction(e.clientX, e.clientY))
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

    const focusView = (): void => viewport.current?.focus({ preventScroll: true })
    const skip = (): void => { if (current) setSkipped((s) => new Set([...s, current])); focusView() }
    const removeCorners = (): void => {
        setPartial((m) => { const rest = { ...m }; delete rest.backL; delete rest.backR; return rest })
        setSkipped(new Set<MarkKey>(['backL', 'backR']))
        focusView()
    }
    const done = (): void => {
        if (!isComplete(partial)) return
        const { postL, postR, barL, barR, backL, backR } = partial
        onDone(backL && backR ? { postL, postR, barL, barR, backL, backR } : { postL, postR, barL, barR })
    }

    const pts = partial
    const poly = pts.postL && pts.postR && pts.barL && pts.barR ? footprint(pts as GoalMarks) : null
    const aspect = frame.frame?.aspect ?? 16 / 9

    return (
        <div
            ref={root}
            className={`goal-marks goal-marks--${team}`}
            data-owns-escape
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() } }}
        >
            <p className="goal-marks__prompt" role="status">{current ? promptFor(current, touch) : DONE_TEXT}</p>
            <div
                ref={viewport}
                className="goal-marks__view"
                style={{ aspectRatio: String(aspect) }}
                tabIndex={0}
                role="application"
                aria-label={VIEW_LABEL}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={viewDown}
                onPointerMove={viewMove}
                onPointerUp={viewUp}
                onPointerCancel={viewUp}
                onKeyDown={viewKeyDown}
                onKeyUp={viewKeyUp}
                onBlur={() => { space.current = false }}
            >
                {frame.frame ? (
                    <div
                        ref={picture}
                        className="goal-marks__picture"
                        data-testid="goal-marks-picture"
                        style={{ transform: `translate(${zp.pan.x}px, ${zp.pan.y}px) scale(${zp.zoom})`, ['--zoom' as string]: String(zp.zoom) }}
                        onClick={onPictureClick}
                    >
                        <div className="goal-marks__content" style={{ aspectRatio: String(aspect), ['--aspect' as string]: String(aspect) }}>
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
                                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 / zp.zoom})` }}
                                    onClick={dotClick}
                                    onPointerDown={dotDown(key)}
                                    onPointerMove={dotMove(key)}
                                    onPointerUp={dotUp(key)}
                                    onPointerCancel={dotUp(key)}
                                    onKeyDown={dotKey(key)}
                                />
                            )
                        })}
                        </div>
                    </div>
                ) : <p className="frame-boxes__empty" role="status">{frame.status === 'loading' ? 'Loading a frame…' : 'No picture available for this video here.'}</p>}
            </div>
            <p className="goal-marks__hint">{touch ? HINT_TOUCH : HINT_FINE}</p>
            <div className="goal-areas__row">
                {step?.optional && <button type="button" className="btn-quiet" onClick={skip}>Skip</button>}
                {partial.backL && partial.backR && <button type="button" className="btn-quiet" onClick={removeCorners}>Remove net corners</button>}
                {zp.zoom > 1 && <button type="button" className="btn-quiet" onClick={() => { zp.reset(); focusView() }}>Reset zoom</button>}
                <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
                <button type="button" className="btn-primary" disabled={!isComplete(partial)} onClick={done}>Done</button>
            </div>
        </div>
    )
}
