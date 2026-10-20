import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import type { GoalMarks, GoalTeam, Pt } from '../../types'
import { footprint } from '../../utils/goalMarks'
import { MARK_STEPS, type MarkKey } from '../../utils/goalMarkSteps'
import { clampViewPan, contentSize, guessNextPoint, panToCentre, viewToFrame, zoomViewAt, type View, type Viewport } from '../../utils/goalSetup'
import { wheelZoomFactor } from '../../utils/zoom'
import type { Frame } from '../frameGrab'

export const MAX_PLACER_ZOOM = 15
const ZOOM_STEP = 1.6
const NUDGE = 0.002
const NUDGE_BIG = 0.01
const DRAG_START_PX = 6
/** Touch: a tap this close to the crosshair's centre sets the point; this close to a placed dot picks it. */
const CROSSHAIR_TAP_PX = 44
const DOT_TAP_PX = 28

export interface PostPlacerHandle {
    /** Touch: place the current point under the crosshair. Returns false when there is nothing to place. */
    setPoint: () => boolean
    /** Touch: centre the picture on a placed point. */
    centreOn: (key: MarkKey) => void
}

interface PostPlacerProps {
    frame: Frame | null
    loading?: boolean
    team: GoalTeam
    marks: Partial<GoalMarks>
    /** The point to place next; null when all wanted points are set. */
    current: MarkKey | null
    /** The other goal, when set: the first guess for this goal's points mirrors it. */
    other?: GoalMarks | null
    /** Touch: move the picture under a fixed crosshair. Otherwise click to place. */
    touch: boolean
    /** Zoom the picture starts at on touch (the first point is placed from here). */
    startZoom: number
    onMarksChange: (marks: Partial<GoalMarks>) => void
    /** Touch: a placed dot was tapped, to move it. */
    onPick?: (key: MarkKey) => void
    ref?: Ref<PostPlacerHandle>
}

const LABELS: Record<MarkKey, string> = {
    postL: 'Left post bottom',
    postR: 'Right post bottom',
    barL: 'Left post top',
    barR: 'Right post top',
    backL: 'Back-left corner',
    backR: 'Back-right corner',
}
const line = (a: Pt, b: Pt): string => `M${a.x} ${a.y}L${b.x} ${b.y}`
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * The picture for placing goal posts. Touch: one finger drags the picture under a fixed crosshair, two fingers (or the
 * + / − buttons) zoom, and Set point (outside, via the handle) places the point under the crosshair. Mouse: click
 * places, drag a dot to adjust, wheel zooms, Space-drag or right-drag pans, arrow keys nudge a focused dot.
 */
export function PostPlacer({ frame, loading, team, marks, current, other, touch, startZoom, onMarksChange, onPick, ref }: PostPlacerProps) {
    const viewportEl = useRef<HTMLDivElement | null>(null)
    const [vp, setVp] = useState<Viewport>({ width: 1, height: 1 })
    const [view, setView] = useState<View>({ zoom: touch ? startZoom : 1, pan: { x: 0, y: 0 } })
    const aspect = frame?.aspect ?? 16 / 9
    const vpRef = useRef(vp), viewRef = useRef(view), aspectRef = useRef(aspect), marksRef = useRef(marks)
    vpRef.current = vp; viewRef.current = view; aspectRef.current = aspect; marksRef.current = marks
    const space = useRef(false)
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const pinch = useRef<{ dist: number; zoom: number } | null>(null)
    const moved = useRef(false)
    const rightPan = useRef(false)
    const dragging = useRef<{ key: MarkKey; startX: number; startY: number; off: Pt } | null>(null)
    const dragMoved = useRef(false)
    const cursorLabel = useRef<HTMLDivElement | null>(null)
    /** Touch: the single finger now down, until it is known to be a tap or a drag. */
    const tap = useRef<{ x: number; y: number; lastX: number; lastY: number; panning: boolean } | null>(null)

    useLayoutEffect(() => {
        const el = viewportEl.current
        if (!el) return
        const measure = (): void => {
            const r = el.getBoundingClientRect()
            setVp((p) => (p.width === (r.width || 1) && p.height === (r.height || 1) ? p : { width: r.width || 1, height: r.height || 1 }))
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [frame?.src])

    // Touch: the picture starts where the first point probably is, once. After that the view stays put between points.
    const started = useRef(false)
    useEffect(() => {
        if (!touch || !frame || !current || started.current || vp.width <= 1) return
        started.current = true
        setView((v) => ({ zoom: v.zoom, pan: panToCentre(guessNextPoint(current, marksRef.current, other), v.zoom, vp, aspectRef.current) }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current, touch, frame, vp])

    // Wheel needs a non-passive listener to stop the page scrolling.
    useEffect(() => {
        const el = viewportEl.current
        if (!el) return
        const onWheel = (e: WheelEvent): void => {
            e.preventDefault()
            const r = el.getBoundingClientRect()
            setView((v) => zoomViewAt(v, wheelZoomFactor(e.deltaY, e.deltaMode), { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) }, vpRef.current, aspectRef.current, MAX_PLACER_ZOOM))
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [frame?.src])

    const atClient = (clientX: number, clientY: number): Pt => {
        const r = viewportEl.current?.getBoundingClientRect()
        const at = { x: clientX - ((r?.left ?? 0) + (r?.width ?? 0) / 2), y: clientY - ((r?.top ?? 0) + (r?.height ?? 0) / 2) }
        return viewToFrame(viewRef.current, vpRef.current, aspectRef.current, at)
    }
    const place = (key: MarkKey, p: Pt): void => onMarksChange({ ...marksRef.current, [key]: p })

    const centreOn = (key: MarkKey): void => {
        const p = marksRef.current[key]
        if (p) setView((v) => ({ zoom: v.zoom, pan: panToCentre(p, v.zoom, vpRef.current, aspectRef.current) }))
    }
    const setPoint = (): boolean => {
        if (!current || !frame) return false
        place(current, viewToFrame(viewRef.current, vpRef.current, aspectRef.current))
        return true
    }
    useImperativeHandle(ref, () => ({ setPoint, centreOn }))

    /** Touch: a tap on the crosshair sets the point; a tap on a placed dot picks it to move. */
    const tapAt = (x: number, y: number): void => {
        const r = viewportEl.current?.getBoundingClientRect()
        if (!r || !frame) return
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        if (current && Math.hypot(x - cx, y - cy) <= CROSSHAIR_TAP_PX) { setPoint(); return }
        const v = viewRef.current, c = contentSize(vpRef.current, aspectRef.current)
        let best: { key: MarkKey; d: number } | null = null
        for (const { key } of MARK_STEPS) {
            const p = marksRef.current[key]
            if (!p) continue
            const d = Math.hypot(cx + v.pan.x + (p.x - 0.5) * c.w * v.zoom - x, cy + v.pan.y + (p.y - 0.5) * c.h * v.zoom - y)
            if (d <= DOT_TAP_PX && (!best || d < best.d)) best = { key, d }
        }
        if (best) { centreOn(best.key); onPick?.(best.key) }
    }

    const dist = (): number => {
        const [a, b] = [...pointers.current.values()]
        return Math.hypot(a.x - b.x, a.y - b.y) || 1
    }
    const down = (e: PointerEvent<HTMLDivElement>): void => {
        if (dragging.current) return
        if (e.button === 2) rightPan.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        moved.current = false
        tap.current = touch && pointers.current.size === 1 ? { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, panning: false } : null
        if (pointers.current.size === 2) { pinch.current = { dist: dist(), zoom: viewRef.current.zoom }; moved.current = true }
    }
    const move = (e: PointerEvent<HTMLDivElement>): void => {
        const tag = cursorLabel.current
        if (tag && !touch) {
            const r = viewportEl.current?.getBoundingClientRect()
            tag.style.display = 'block'
            tag.style.transform = `translate(${e.clientX - (r?.left ?? 0) + 16}px, ${e.clientY - (r?.top ?? 0) + 18}px)`
        }
        const prev = pointers.current.get(e.pointerId)
        if (!prev) return
        const next = { x: e.clientX, y: e.clientY }
        pointers.current.set(e.pointerId, next)
        const dx = next.x - prev.x, dy = next.y - prev.y
        if (pointers.current.size >= 2 && pinch.current) {
            const z = pinch.current.zoom * (dist() / pinch.current.dist)
            setView((v) => {
                const zv = zoomViewAt(v, z / v.zoom, { x: 0, y: 0 }, vpRef.current, aspectRef.current, MAX_PLACER_ZOOM)
                return { zoom: zv.zoom, pan: clampViewPan(zv.zoom, { x: zv.pan.x + dx / 2, y: zv.pan.y + dy / 2 }, vpRef.current, aspectRef.current) }
            })
        } else if (touch && tap.current) {
            // A finger that stays within a few pixels is a tap, not a drag: the picture does not wobble under it.
            const t = tap.current
            if (!t.panning && Math.hypot(next.x - t.x, next.y - t.y) < DRAG_START_PX) return
            t.panning = true
            moved.current = true
            const [px, py] = [next.x - t.lastX, next.y - t.lastY]
            t.lastX = next.x; t.lastY = next.y
            setView((v) => ({ zoom: v.zoom, pan: clampViewPan(v.zoom, { x: v.pan.x + px, y: v.pan.y + py }, vpRef.current, aspectRef.current) }))
        } else if (touch || space.current || rightPan.current) {
            if (Math.hypot(dx, dy) > 0) moved.current = true
            setView((v) => ({ zoom: v.zoom, pan: clampViewPan(v.zoom, { x: v.pan.x + dx, y: v.pan.y + dy }, vpRef.current, aspectRef.current) }))
        }
    }
    const up = (e: PointerEvent<HTMLDivElement>): void => {
        if (!pointers.current.delete(e.pointerId)) return
        const t = tap.current
        if (t && e.type === 'pointerup' && pointers.current.size === 0 && !t.panning && !pinch.current) { tap.current = null; tapAt(t.x, t.y) }
        if (pointers.current.size === 0) tap.current = null
        if (pointers.current.size === 0) rightPan.current = false
        if (pinch.current && pointers.current.size < 2) pinch.current = null
        if (pointers.current.size === 0 && moved.current) setTimeout(() => { moved.current = false }, 0)
    }
    const click = (e: React.MouseEvent<HTMLDivElement>): void => {
        if (touch || moved.current || space.current || !current) return
        place(current, atClient(e.clientX, e.clientY))
    }
    const viewKey = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.target !== e.currentTarget) return
        if (e.key === ' ') { space.current = true; e.preventDefault(); e.stopPropagation() }
        else if (e.key === 'Enter' && current) {
            e.preventDefault(); e.stopPropagation()
            place(current, viewToFrame(viewRef.current, vpRef.current, aspectRef.current))
        }
    }

    const dotDown = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        if (e.button > 0 || touch) return
        e.stopPropagation()
        if (space.current) return
        const p = marks[key]
        const at = atClient(e.clientX, e.clientY)
        dragging.current = { key, startX: e.clientX, startY: e.clientY, off: p ? { x: p.x - at.x, y: p.y - at.y } : { x: 0, y: 0 } }
        dragMoved.current = false
        e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    const dotMove = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        const d = dragging.current
        if (d?.key !== key) return
        if (!dragMoved.current && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_START_PX) return
        dragMoved.current = true
        const at = atClient(e.clientX, e.clientY)
        place(key, { x: clamp01(at.x + d.off.x), y: clamp01(at.y + d.off.y) })
    }
    const dotUp = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>): void => {
        if (dragging.current?.key !== key) return
        dragging.current = null
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        if (!dragMoved.current) return
        moved.current = true
        setTimeout(() => { moved.current = false }, 0)
    }
    const dotClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
        e.stopPropagation()
        if (dragMoved.current || e.detail === 0 || space.current || !current) return
        place(current, atClient(e.clientX, e.clientY))
    }
    const dotKey = (key: MarkKey) => (e: KeyboardEvent<HTMLButtonElement>): void => {
        const p = marks[key]
        if (!p) return
        const d = e.shiftKey ? NUDGE_BIG : NUDGE
        const delta = e.key === 'ArrowLeft' ? [-d, 0] : e.key === 'ArrowRight' ? [d, 0] : e.key === 'ArrowUp' ? [0, -d] : e.key === 'ArrowDown' ? [0, d] : null
        if (!delta) return
        e.preventDefault(); e.stopPropagation()
        place(key, { x: clamp01(p.x + delta[0]), y: clamp01(p.y + delta[1]) })
    }

    const zoomBy = (f: number): void => setView((v) => zoomViewAt(v, f, { x: 0, y: 0 }, vpRef.current, aspectRef.current, MAX_PLACER_ZOOM))
    const poly = marks.postL && marks.postR && marks.barL && marks.barR ? footprint(marks as GoalMarks) : null

    return (
        <div
            ref={viewportEl}
            className={`gs-view gs-view--${team}`}
            data-testid="goal-setup-view"
            tabIndex={0}
            role="application"
            aria-label={touch
                ? 'Goal picture. Drag to move the picture until the crosshair is on the point, then tap the crosshair or press Set point. Tap a placed dot to move it. Pinch or use + and − to zoom.'
                : 'Goal picture. Click to place the point; drag a dot to adjust; arrow keys nudge a focused dot. Scroll to zoom; Space-drag or right-drag to move.'}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={() => { if (cursorLabel.current) cursorLabel.current.style.display = 'none' }}
            onClick={click}
            onKeyDown={viewKey}
            onKeyUp={(e) => { if (e.key === ' ') space.current = false }}
            onBlur={() => { space.current = false }}
            style={{ cursor: touch ? 'grab' : 'crosshair' }}
        >
            {frame ? (
                <>
                    <div
                        className="gs-picture"
                        data-loading={loading || undefined}
                        data-testid="goal-setup-picture"
                        style={{ transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`, ['--zoom' as string]: String(view.zoom) }}
                    >
                        <div className="gs-content" style={{ aspectRatio: String(aspect), ['--aspect' as string]: String(aspect) }}>
                            <img className="gs-img" src={frame.src} alt="" draggable={false} />
                            <svg className="gs-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                                {poly && <polygon className="gs-foot" points={poly.map((p) => `${p.x},${p.y}`).join(' ')} />}
                                {marks.postL && marks.barL && <path className="gs-stroke" d={line(marks.postL, marks.barL)} />}
                                {marks.postR && marks.barR && <path className="gs-stroke" d={line(marks.postR, marks.barR)} />}
                                {marks.barL && marks.barR && <path className="gs-stroke" d={line(marks.barL, marks.barR)} />}
                                {marks.postL && marks.postR && <path className="gs-stroke gs-stroke--base" d={line(marks.postL, marks.postR)} />}
                            </svg>
                            {MARK_STEPS.map(({ key }) => {
                                const p = marks[key]
                                if (!p) return null
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        className="gs-dot"
                                        aria-label={LABELS[key]}
                                        tabIndex={touch ? -1 : 0}
                                        style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 / view.zoom})`, pointerEvents: touch ? 'none' : undefined }}
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
                    {!touch && current && <div ref={cursorLabel} className="gs-cursorlabel" data-testid="goal-setup-cursor-label" aria-hidden="true">{LABELS[current]}{current.startsWith('back') ? ' (optional)' : ''}</div>}
                    {touch && current && <div className="gs-crosshair" data-testid="goal-setup-crosshair" aria-hidden="true" />}
                    <div className="gs-zoom" role="group" aria-label="Zoom" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="gs-zoom__btn" aria-label="Zoom out" disabled={view.zoom <= 1} onClick={() => zoomBy(1 / ZOOM_STEP)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                        </button>
                        <button type="button" className="gs-zoom__btn" aria-label="Zoom in" disabled={view.zoom >= MAX_PLACER_ZOOM - 1e-6} onClick={() => zoomBy(ZOOM_STEP)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
                        </button>
                    </div>
                </>
            ) : <p className="gs-empty" role="status">{loading ? 'Loading a frame…' : 'No picture available for this video here.'}</p>}
        </div>
    )
}
