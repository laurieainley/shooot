/** Test helper: make `matchMedia('(pointer: coarse)')` (and only that query) match or not. */
export function setCoarsePointer(coarse: boolean): void {
    window.matchMedia = ((query: string) => ({
        matches: query.includes('pointer: coarse') ? coarse : false, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
}
