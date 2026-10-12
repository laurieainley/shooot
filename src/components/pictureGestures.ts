import { classifyPointer, wheelZoomFactor } from '../utils/zoom'
import type { ZoomPan } from './useZoomPan'

/**
 * Pan and zoom gestures on the player picture. Mouse: drag the picture to pan while zoomed, wheel / trackpad pinch zooms
 * towards the cursor, two-finger scroll pans. Touch: one finger pans while zoomed (a tap still plays / pauses), two fingers
 * pinch-zoom between 1× and 4× and pan; lifting one finger after a pinch carries on panning with the other.
 * A pan or pinch swallows the click it ends with (no play / pause). Returns the cleanup.
 */
export function attachPictureGestures(el: HTMLElement, zoom: () => ZoomPan): () => void {
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null
    let drag: { id: number; start: { x: number; y: number }; at: number; dragging: boolean } | null = null
    let dragged = false
    const spread = (): { dist: number; mid: { x: number; y: number } } => {
        const [a, b] = Array.from(pointers.values())
        return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }
    const onPicture = (e: Event): boolean => !(e.target as HTMLElement).closest('.vjs-control-bar, button, .event-picker, .column-panel, .toast-host, .vjs-menu')
    const onDown = (e: PointerEvent): void => {
        if (!onPicture(e)) return
        if (e.pointerType === 'touch') {
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
            dragged = false
            if (pointers.size === 2) {
                const s = spread()
                pinch = { dist: s.dist, zoom: zoom().zoom, mid: s.mid }
                drag = null
                el.classList.remove('zoom-dragging')
            } else if (pointers.size === 1 && zoom().zoom > 1) {
                drag = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, at: performance.now(), dragging: false }
            }
        } else if (e.button === 0 && zoom().zoom > 1) {
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
            drag = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, at: performance.now(), dragging: false }
            dragged = false
        }
    }
    const onMove = (e: PointerEvent): void => {
        const prev = pointers.get(e.pointerId)
        if (!prev) return
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pinch && pointers.size === 2) {
            const s = spread()
            if (pinch.dist > 0) zoom().pinchTo(pinch.zoom * (s.dist / pinch.dist))
            zoom().panBy(s.mid.x - pinch.mid.x, s.mid.y - pinch.mid.y)
            pinch.mid = s.mid
            dragged = true
            e.preventDefault()
        } else if (drag && drag.id === e.pointerId) {
            if (!drag.dragging) {
                const kind = classifyPointer(Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y), 0)
                if (kind === 'click') return
                drag.dragging = true
                dragged = true
                el.classList.add('zoom-dragging')
                try { el.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
            }
            zoom().panBy(e.clientX - prev.x, e.clientY - prev.y)
            e.preventDefault()
        }
    }
    const onUp = (e: PointerEvent): void => {
        if (!pointers.delete(e.pointerId)) return
        if (drag && drag.id === e.pointerId) {
            // A slow press without movement is neither a click nor a pan: leave the click alone only when it qualifies.
            if (!drag.dragging && classifyPointer(Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y), performance.now() - drag.at) === 'drag') dragged = true
            if (drag.dragging) try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
            el.classList.remove('zoom-dragging')
            drag = null
        }
        if (pinch && pointers.size < 2) {
            pinch = null
            zoom().pinchEnd()
            // The finger still down keeps panning from where it is.
            const [left] = Array.from(pointers.entries())
            if (left && zoom().zoom > 1) drag = { id: left[0], start: left[1], at: performance.now(), dragging: true }
        }
    }
    // A pan or pinch must not also toggle play / count as a tap.
    const onClick = (e: MouseEvent): void => {
        if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false }
    }
    const onWheel = (e: WheelEvent): void => {
        if (!onPicture(e)) return
        const z = zoom()
        if (!e.ctrlKey && z.zoom <= 1) return
        const rect = el.getBoundingClientRect()
        if (e.ctrlKey) {
            z.zoomAt(wheelZoomFactor(e.deltaY), { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 })
        } else {
            z.panBy(-e.deltaX, -e.deltaY)
        }
        e.preventDefault()
    }
    el.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, { capture: true, passive: false })
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    el.addEventListener('click', onClick, true)
    el.addEventListener('wheel', onWheel, { passive: false })
    return (): void => {
        el.removeEventListener('pointerdown', onDown, true)
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', onUp, true)
        window.removeEventListener('pointercancel', onUp, true)
        el.removeEventListener('click', onClick, true)
        el.removeEventListener('wheel', onWheel)
    }
}
