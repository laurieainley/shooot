const DARK_LUMA = 20
const BRIGHT_SHARE = 0.01

/**
 * Whether RGBA pixels from a canvas are (near-)black: almost none of them rise above a very dark luma. Used to spot a
 * video frame that was drawn before the browser had painted it (Android Chrome fires `seeked` early).
 */
export function isNearBlack(rgba: ArrayLike<number>): boolean {
    const n = Math.floor(rgba.length / 4)
    if (n === 0) return true
    let bright = 0
    for (let i = 0; i < n; i++) {
        const luma = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
        if (luma > DARK_LUMA) bright++
    }
    return bright / n < BRIGHT_SHARE
}
