export const DEFAULT_FPS = 30000 / 1001

export function seekStepFor(e: { shiftKey: boolean }): number {
    return e.shiftKey ? 1 : 5
}

// Targets the middle of the neighbouring frame so the browser shows exactly that frame.
export function frameStepTime(currentSec: number, direction: 1 | -1, fps: number = DEFAULT_FPS, durationSec: number = Infinity): number {
    const frame = Math.floor(currentSec * fps + 1e-6) + direction
    const t = (frame + 0.5) / fps
    return Math.min(Math.max(0, t), durationSec)
}
