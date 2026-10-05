export type ViewportMetrics = {
    /** window.innerHeight: the layout viewport, which an on-screen keyboard does not resize (Chrome's default). */
    layoutHeight: number
    /** visualViewport.height: what is actually visible above the keyboard. */
    viewportHeight: number
    /** visualViewport.offsetTop: how far the visible part is scrolled down inside the layout viewport. */
    viewportOffsetTop: number
}

/** Height (px) of the layout viewport hidden behind the on-screen keyboard; under 40px counts as none. */
export function keyboardInset({ layoutHeight, viewportHeight, viewportOffsetTop }: ViewportMetrics): number {
    const covered = Math.round(layoutHeight - viewportHeight - viewportOffsetTop)
    return covered >= 40 ? covered : 0
}
