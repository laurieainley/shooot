interface MediaFlags {
    /** `(min-width: 900px)` */
    desktop?: boolean
    /** `(pointer: coarse)` */
    coarse?: boolean
    /** short landscape viewport: `(orientation: landscape) and (max-height: 500px)` */
    landscape?: boolean
}

/** Test helper: answer `matchMedia` per query — desktop width, coarse pointer and short-landscape flags. */
export function setMedia({ desktop = false, coarse = false, landscape = false }: MediaFlags): void {
    window.matchMedia = ((query: string) => ({
        matches: query.includes('pointer: coarse') ? coarse
            : query.includes('orientation: landscape') ? landscape
            : query.includes('min-width: 900px') ? desktop
            : false,
        media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
}

/** Test helper: make `matchMedia('(pointer: coarse)')` (and only that query) match or not. */
export function setCoarsePointer(coarse: boolean): void {
    setMedia({ coarse })
}
