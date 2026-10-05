/** Phone top bar: hidden while scrolling down the page, back on any scroll up and always near the top. */
export function nextBarVisible(visible: boolean, prevY: number, y: number, threshold = 8, revealAtTop = 64): boolean {
    if (y <= revealAtTop) return true
    if (y - prevY > threshold) return false
    if (prevY - y > threshold) return true
    return visible
}
