export const LARGE_FILE_BYTES = 2 * 1024 ** 3

/** iPadOS copies a picked file before the page can open it; for multi-GB GoPro MP4s that takes minutes. */
export function largeFileHint(ios: boolean, sizes: number[]): string | null {
    if (!ios || !sizes.some((s) => s > LARGE_FILE_BYTES)) return null
    return 'iPadOS copies files before the app can open them — large GoPro MP4s can take a few minutes. Tip: edit with the .LRV previews and attach MP4s only to render.'
}
