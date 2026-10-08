export const LARGE_FILE_BYTES = 2 * 1024 ** 3

/** iPadOS copies a picked file before the page can open it; for multi-GB videos that takes minutes. */
export function largeFileHint(ios: boolean, sizes: number[]): string | null {
    if (!ios || !sizes.some((s) => s > LARGE_FILE_BYTES)) return null
    return 'iPadOS copies files before the app can open them — large videos can take a few minutes. Tip: if your camera saves .LRV proxy previews (GoPro does), edit with those and attach the full videos only to render.'
}
