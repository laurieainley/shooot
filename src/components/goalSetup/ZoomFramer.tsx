import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { CropRect } from '../../types'
import { MIN_BOX_W, isSoft } from '../../utils/crop'
import { cropImageStyle, mapTapToBox, panBox, pinchBox, stepBox } from '../../utils/goalSetup'
import { wheelZoomFactor } from '../../utils/zoom'
import type { Frame } from '../frameGrab'

interface ZoomFramerProps {
    frame: Frame | null
    rect: CropRect
    /** The box worked out from the posts (or the default): what Reset returns to. */
    home: CropRect
    onChange: (rect: CropRect) => void
}

const KEY_STEP = 0.01

/**
 * The replay view is the editor: the picture area shows exactly what a replay of a goal at this end shows (the still
 * cropped to the box, at the frame's aspect). Drag pans, pinch / wheel / Closer / Wider zoom, the corner map jumps.
 */
export function ZoomFramer({ frame, rect, home, onChange }: ZoomFramerProps) {
    const view = useRef<HTMLDivElement | null>(null)
    const rectRef = useRef(rect)
    rectRef.current = rect
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const pinch = useRef<{ dist: number; start: CropRect } | null>(null)
    const aspect = frame?.aspect ?? 16 / 9
    const [, force] = useState(0)

    const size = (): { width: number; height: number } => {
        const r = view.current?.getBoundingClientRect()
        return { width: r?.width || 1, height: r?.height || 1 }
    }
    const dist = (): number => {
        const [a, b] = [...pointers.current.values()]
        return Math.hypot(a.x - b.x, a.y - b.y) || 1
    }

    useEffect(() => {
        const el = view.current
        if (!el) return
        const onWheel = (e: WheelEvent): void => {
            e.preventDefault()
            onChange(pinchBox(rectRef.current, wheelZoomFactor(e.deltaY, e.deltaMode)))
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [frame?.src, onChange])

    const down = (e: PointerEvent<HTMLDivElement>): void => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2) pinch.current = { dist: dist(), start: rectRef.current }
    }
    const move = (e: PointerEvent<HTMLDivElement>): void => {
        const prev = pointers.current.get(e.pointerId)
        if (!prev) return
        const next = { x: e.clientX, y: e.clientY }
        pointers.current.set(e.pointerId, next)
        if (pointers.current.size >= 2 && pinch.current) onChange(pinchBox(pinch.current.start, dist() / pinch.current.dist))
        else onChange(panBox(rectRef.current, next.x - prev.x, next.y - prev.y, size()))
    }
    const up = (e: PointerEvent<HTMLDivElement>): void => {
        pointers.current.delete(e.pointerId)
        if (pointers.current.size < 2) pinch.current = null
        force((n) => n + 1)
    }
    const key = (e: KeyboardEvent<HTMLDivElement>): void => {
        const r = rectRef.current
        const k = e.key
        let next: CropRect | null = null
        const d = (e.shiftKey ? 5 : 1) * KEY_STEP
        if (k === 'ArrowLeft') next = mapTapToBox(r, { x: r.x + r.w / 2 - d, y: r.y + r.h / 2 })
        else if (k === 'ArrowRight') next = mapTapToBox(r, { x: r.x + r.w / 2 + d, y: r.y + r.h / 2 })
        else if (k === 'ArrowUp') next = mapTapToBox(r, { x: r.x + r.w / 2, y: r.y + r.h / 2 - d })
        else if (k === 'ArrowDown') next = mapTapToBox(r, { x: r.x + r.w / 2, y: r.y + r.h / 2 + d })
        else if (k === '+' || k === '=') next = stepBox(r, 'closer')
        else if (k === '-') next = stepBox(r, 'wider')
        if (!next) return
        e.preventDefault(); e.stopPropagation()
        onChange(next)
    }
    const tapMap = (e: React.MouseEvent<HTMLDivElement>): void => {
        e.stopPropagation()
        const b = e.currentTarget.getBoundingClientRect()
        onChange(mapTapToBox(rectRef.current, { x: (e.clientX - b.left) / (b.width || 1), y: (e.clientY - b.top) / (b.height || 1) }))
    }

    if (!frame) return <p className="gs-empty" role="status">Loading a frame…</p>
    const atMin = rect.w <= MIN_BOX_W + 1e-6, atMax = rect.w >= 1 - 1e-6
    const zoomLabel = `${(1 / rect.w).toFixed(1)}×`
    return (
        <div className="gs-zoomwrap">
            <div
                ref={view}
                className="gs-zoomview"
                data-testid="goal-setup-replay-view"
                style={{ ['--aspect' as string]: String(aspect) }}
                tabIndex={0}
                role="application"
                aria-label={`Replay view, zoom ${zoomLabel}. Drag to move, pinch or use Closer and Wider to zoom, arrow keys move.`}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onKeyDown={key}
            >
                <img className="gs-zoomview__img" src={frame.src} alt="" draggable={false} style={cropImageStyle(rect)} />
            </div>
            <div className="gs-zoombar" role="group" aria-label="Zoom">
                <div className="gs-map" data-testid="goal-setup-map" role="button" aria-label="Where this view sits in the whole picture. Tap to move it." onClick={tapMap} style={{ aspectRatio: String(aspect) }}>
                    <img src={frame.src} alt="" draggable={false} />
                    <span className="gs-map__box" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />
                </div>
                <button type="button" className="btn-quiet" disabled={atMin} onClick={() => onChange(stepBox(rect, 'closer'))}>Closer</button>
                <button type="button" className="btn-quiet" disabled={atMax} onClick={() => onChange(stepBox(rect, 'wider'))}>Wider</button>
                <button type="button" className="btn-text" onClick={() => onChange(home)}>Reset</button>
                <span className="gs-zoombar__zoom tc" aria-hidden="true">{zoomLabel}</span>
            </div>
            {isSoft(rect) && <p className="replay-framing__warn" role="status">A very small box zooms in a lot: replays will look soft on 1080p footage.</p>}
        </div>
    )
}
