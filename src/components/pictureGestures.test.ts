// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { attachPictureGestures } from './pictureGestures'
import type { ZoomPan } from './useZoomPan'

const fire = (target: EventTarget, type: string, id: number, x: number, y: number, pointerType = 'touch'): void => {
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }))
}

describe('attachPictureGestures', () => {
    let el: HTMLElement
    let z: ZoomPan
    let detach: () => void
    beforeEach(() => {
        el = document.createElement('div')
        document.body.appendChild(el)
        z = { zoom: 1, pan: { x: 0, y: 0 }, panBy: vi.fn(), pinchTo: vi.fn(), pinchEnd: vi.fn(), zoomAt: vi.fn() } as unknown as ZoomPan
        detach = attachPictureGestures(el, () => z)
    })
    afterEach(() => { detach(); el.remove() })

    it('should pan with one finger while zoomed in, and swallow the tap that ends the drag', () => {
        z.zoom = 2
        fire(el, 'pointerdown', 1, 100, 100)
        fire(window, 'pointermove', 1, 130, 110)
        fire(window, 'pointermove', 1, 150, 120)
        expect(z.panBy).toHaveBeenLastCalledWith(20, 10)
        fire(window, 'pointerup', 1, 150, 120)
        const click = new MouseEvent('click', { bubbles: true, cancelable: true })
        el.dispatchEvent(click)
        expect(click.defaultPrevented).toBe(true)
    })

    it('should leave a one-finger tap alone (play / pause) while zoomed in', () => {
        z.zoom = 2
        fire(el, 'pointerdown', 1, 100, 100)
        fire(window, 'pointermove', 1, 102, 101)
        fire(window, 'pointerup', 1, 102, 101)
        expect(z.panBy).not.toHaveBeenCalled()
        const click = new MouseEvent('click', { bubbles: true, cancelable: true })
        el.dispatchEvent(click)
        expect(click.defaultPrevented).toBe(false)
    })

    it('should not pan or pinch from inside a column panel shown over the picture (fullscreen review)', () => {
        z.zoom = 2
        const panel = document.createElement('div')
        panel.className = 'column-panel'
        el.appendChild(panel)
        fire(panel, 'pointerdown', 1, 100, 100)
        fire(window, 'pointermove', 1, 160, 100)
        expect(z.panBy).not.toHaveBeenCalled()
    })

    it('should not pan with one finger when not zoomed in', () => {
        fire(el, 'pointerdown', 1, 100, 100)
        fire(window, 'pointermove', 1, 160, 100)
        expect(z.panBy).not.toHaveBeenCalled()
    })

    it('should still pinch and pan with two fingers, then carry on panning with the finger left', () => {
        z.zoom = 2
        fire(el, 'pointerdown', 1, 100, 100)
        fire(el, 'pointerdown', 2, 200, 100)
        fire(window, 'pointermove', 2, 300, 100)
        expect(z.pinchTo).toHaveBeenCalledWith(4)
        fire(window, 'pointerup', 2, 300, 100)
        expect(z.pinchEnd).toHaveBeenCalled()
        vi.mocked(z.panBy).mockClear()
        fire(window, 'pointermove', 1, 90, 95)
        expect(z.panBy).toHaveBeenLastCalledWith(-10, -5)
    })

    it('should ignore wheel, pinch and drag while locked', () => {
        detach()
        let locked = true
        detach = attachPictureGestures(el, () => z, () => locked)
        z.zoom = 2
        const wheel = new WheelEvent('wheel', { deltaY: -50, bubbles: true, cancelable: true })
        el.dispatchEvent(wheel)
        expect(z.panBy).not.toHaveBeenCalled()
        expect(wheel.defaultPrevented).toBe(false)
        fire(el, 'pointerdown', 1, 100, 100)
        fire(el, 'pointerdown', 2, 200, 100)
        fire(window, 'pointermove', 2, 300, 100)
        fire(window, 'pointermove', 1, 90, 95)
        expect(z.pinchTo).not.toHaveBeenCalled()
        expect(z.panBy).not.toHaveBeenCalled()
        locked = false
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, bubbles: true, cancelable: true }))
        expect(z.panBy).toHaveBeenCalled()
    })
})
