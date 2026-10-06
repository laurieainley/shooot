interface MediaFlags {
    /** `(min-width: 900px)` */
    desktop?: boolean
    /** `(pointer: coarse)` */
    coarse?: boolean
    /** short landscape viewport: `(orientation: landscape) and (max-height: 500px)` */
    landscape?: boolean
    /** touch tablet: coarse pointer, at least 600px in both directions */
    tablet?: boolean
    /** `(orientation: portrait)` */
    portrait?: boolean
}

const listeners = new Set<() => void>()
let current: Required<MediaFlags> = { desktop: false, coarse: false, landscape: false, tablet: false, portrait: false }

function answer(query: string): boolean {
    return query.includes('min-height: 600px') ? current.tablet
        : query.includes('orientation: portrait') ? current.portrait
        : query.includes('pointer: coarse') ? current.coarse
        : query.includes('orientation: landscape') ? current.landscape
        : query.includes('min-width: 900px') ? current.desktop
        : false
}

/**
 * Test helper: answer `matchMedia` per query — desktop width, coarse pointer, short-landscape, tablet and portrait
 * flags. Calling it again while components are mounted notifies their media-query listeners (a rotation).
 */
export function setMedia({ desktop = false, coarse = false, landscape = false, tablet = false, portrait = false }: MediaFlags): void {
    current = { desktop, coarse, landscape, tablet, portrait }
    window.matchMedia = ((query: string) => ({
        get matches() { return answer(query) },
        media: query, onchange: null,
        addEventListener: (_: string, fn: () => void) => { listeners.add(fn) },
        removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn) },
        addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    for (const fn of [...listeners]) fn()
}

/** Test helper: make `matchMedia('(pointer: coarse)')` (and only that query) match or not. */
export function setCoarsePointer(coarse: boolean): void {
    setMedia({ coarse })
}
