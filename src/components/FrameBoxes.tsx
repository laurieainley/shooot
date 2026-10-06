import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { CropRect } from '../types'
import { clampRect, moveRect, resizeFromCorner, resizeRect, type Corner } from '../utils/crop'
import type { Frame, FrameState } from './frameGrab'

export interface FrameBox {
    id: string
    label: string
    short: string
    rect: CropRect
    tone: 'left' | 'right' | 'event'
}

interface FrameBoxesProps {
    state: FrameState
    boxes: FrameBox[]
    onChange: (id: string, rect: CropRect) => void
    /** Pointer released / key pressed: the edit is complete. */
    onCommit?: (id: string) => void
    /** Shown over the still while there is none. */
    emptyText: string
}

type Gesture =
    | { kind: 'move'; start: CropRect; x: number; y: number }
    | { kind: 'resize'; start: CropRect; x: number; y: number; corner: Corner }
    | { kind: 'pinch'; start: CropRect; dist: number }

const STEP = 0.01
const CORNERS: { corner: Corner; label: string }[] = [
    { corner: 'tl', label: 'top left' },
    { corner: 'tr', label: 'top right' },
    { corner: 'bl', label: 'bottom left' },
    { corner: 'br', label: 'bottom right' },
]

/**
 * A still frame with draggable, resizable boxes (aspect locked to the frame's). Drag the body to move, drag the
 * corner handles (44 px targets, any of the four; the opposite corner stays put) or pinch with two fingers to resize; arrow keys move, +/- resize.
 */
export function FrameBoxes({ state, boxes, onChange, onCommit, emptyText }: FrameBoxesProps) {
    const area = useRef<HTMLDivElement | null>(null)
    const gestures = useRef(new Map<string, { g: Gesture; pointers: Map<number, { x: number; y: number }> }>())
    const frame: Frame | null = state.frame
    // The box last pressed / focused is drawn on top of the others.
    const [selected, setSelected] = useState<string | null>(null)

    const size = (): { w: number; h: number } => {
        const r = area.current?.getBoundingClientRect()
        return { w: r?.width || 1, h: r?.height || 1 }
    }
    const distance = (pts: Map<number, { x: number; y: number }>): number => {
        const [a, b] = [...pts.values()]
        return Math.hypot(a.x - b.x, a.y - b.y) || 1
    }

    const down = (box: FrameBox, kind: 'move' | 'resize', corner: Corner = 'br') => (e: PointerEvent<HTMLElement>): void => {
        setSelected(box.id)
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        const cur = gestures.current.get(box.id)
        const pointers = cur?.pointers ?? new Map<number, { x: number; y: number }>()
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (cur && pointers.size === 2 && kind === 'move') {
            gestures.current.set(box.id, { pointers, g: { kind: 'pinch', start: box.rect, dist: distance(pointers) } })
            return
        }
        gestures.current.set(box.id, {
            pointers,
            g: kind === 'resize' ? { kind: 'resize', start: box.rect, x: e.clientX, y: e.clientY, corner } : { kind: 'move', start: box.rect, x: e.clientX, y: e.clientY },
        })
    }
    const move = (box: FrameBox) => (e: PointerEvent<HTMLElement>): void => {
        const cur = gestures.current.get(box.id)
        if (!cur || !cur.pointers.has(e.pointerId)) return
        cur.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const { w, h } = size()
        const g = cur.g
        if (g.kind === 'pinch' && cur.pointers.size >= 2) {
            const nw = g.start.w * (distance(cur.pointers) / g.dist)
            const cx = g.start.x + g.start.w / 2
            const cy = g.start.y + g.start.h / 2
            onChange(box.id, clampRect({ x: cx - nw / 2, y: cy - nw / 2, w: nw, h: nw }))
        } else if (g.kind === 'move') onChange(box.id, moveRect(g.start, (e.clientX - g.x) / w, (e.clientY - g.y) / h))
        else if (g.kind === 'resize') onChange(box.id, resizeFromCorner(g.start, g.corner, (e.clientX - g.x) / w, (e.clientY - g.y) / h))
    }
    const up = (box: FrameBox) => (e: PointerEvent<HTMLElement>): void => {
        const cur = gestures.current.get(box.id)
        if (!cur) return
        cur.pointers.delete(e.pointerId)
        if (cur.pointers.size === 0) { gestures.current.delete(box.id); onCommit?.(box.id) }
        else if (cur.pointers.size === 1) {
            // One finger left after a pinch: carry on moving from where the box now is.
            const [p] = [...cur.pointers.values()]
            const latest = boxes.find((b) => b.id === box.id)?.rect ?? box.rect
            cur.g = { kind: 'move', start: latest, x: p.x, y: p.y }
        }
    }
    const key = (box: FrameBox) => (e: KeyboardEvent<HTMLElement>): void => {
        const k = e.key
        const big = e.shiftKey ? 5 : 1
        const r = box.rect
        let next: CropRect | null = null
        if (k === 'ArrowLeft') next = moveRect(r, -STEP * big, 0)
        else if (k === 'ArrowRight') next = moveRect(r, STEP * big, 0)
        else if (k === 'ArrowUp') next = moveRect(r, 0, -STEP * big)
        else if (k === 'ArrowDown') next = moveRect(r, 0, STEP * big)
        else if (k === '+' || k === '=') next = resizeRect(r, r.w + STEP * 2 * big)
        else if (k === '-') next = resizeRect(r, r.w - STEP * 2 * big)
        if (!next) return
        e.preventDefault()
        e.stopPropagation()
        onChange(box.id, next)
        onCommit?.(box.id)
    }

    return (
        <div ref={area} className="frame-boxes" style={{ aspectRatio: String(frame?.aspect ?? 16 / 9) }}>
            {frame ? <img className="frame-boxes__img" src={frame.src} alt="" draggable={false} /> : <p className="frame-boxes__empty" role="status">{state.status === 'loading' ? 'Loading a frame…' : emptyText}</p>}
            {frame && boxes.map((b) => (
                <div
                    key={b.id}
                    role="group"
                    tabIndex={0}
                    aria-label={`${b.label} box`}
                    className={`frame-box frame-box--${b.tone}`}
                    style={{ zIndex: b.id === selected ? 2 : 1, left: `${b.rect.x * 100}%`, top: `${b.rect.y * 100}%`, width: `${b.rect.w * 100}%`, height: `${b.rect.h * 100}%` }}
                    onPointerDown={down(b, 'move')}
                    onPointerMove={move(b)}
                    onPointerUp={up(b)}
                    onPointerCancel={up(b)}
                    onFocus={() => setSelected(b.id)}
                    onKeyDown={key(b)}
                >
                    <span className="frame-box__tag">{b.short}</span>
                    {CORNERS.map(({ corner, label }) => (
                        <span
                            key={corner}
                            role="button"
                            aria-label={`Resize ${b.label} box, ${label}`}
                            className={`frame-box__handle frame-box__handle--${corner}`}
                            onPointerDown={down(b, 'resize', corner)}
                            onPointerMove={move(b)}
                            onPointerUp={up(b)}
                            onPointerCancel={up(b)}
                        />
                    ))}
                </div>
            ))}
        </div>
    )
}
