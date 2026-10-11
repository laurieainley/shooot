// The short motif: the ball whips across the frame close to camera and wipes from scene A to scene B
// (a broadcast replay wipe, with our ball as the logo). 15 frames.
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { clamp01, ease } from '../brand'
import { Ball3DLayer, type BallState } from './Ball3D'

export const WHIP_FRAMES = 15

export function whipBall(f: number, dir: 1 | -1 = 1): BallState | null {
    if (f < 0 || f > WHIP_FRAMES) return null
    const t = f / WHIP_FRAMES
    const u = ease.expoInOut(t) * 0.7 + t * 0.3
    const x = dir > 0 ? -460 + u * (1920 + 920) : 2380 - u * (1920 + 920)
    const y = 820 - 420 * u + Math.sin(Math.PI * u) * -60
    const r = 160 + 560 * Math.sin(Math.PI * clamp01(u)) ** 1.4
    return { x, y, r, rx: t * 6, ry: dir * t * 9, rz: 0.4, red: 0, stretch: 1.12, dir: Math.atan2(-420, dir * 2840) }
}

/** Seam x (px) where B has been revealed up to: just behind the ball's centre. */
export function whipSeam(f: number, dir: 1 | -1 = 1): number {
    const b = whipBall(Math.min(WHIP_FRAMES, Math.max(0, f)), dir)
    if (!b) return f < 0 ? (dir > 0 ? 0 : 1920) : dir > 0 ? 1920 : 0
    return b.x
}

/** Scene A until `at`, a ball wipe to B over WHIP_FRAMES, then B. */
export function WhipCut({ at, a, b, dir = 1 }: { at: number; a: React.ReactNode; b: React.ReactNode; dir?: 1 | -1 }): React.ReactElement {
    const f = useCurrentFrame()
    const lf = f - at
    if (lf < 0) return <AbsoluteFill>{a}</AbsoluteFill>
    if (lf > WHIP_FRAMES) return <AbsoluteFill>{b}</AbsoluteFill>
    const seam = whipSeam(lf, dir)
    const ball = whipBall(lf, dir)
    const clipB = dir > 0 ? `inset(0 ${Math.max(0, 1920 - seam)}px 0 0)` : `inset(0 0 0 ${Math.max(0, seam)}px)`
    return (
        <AbsoluteFill>
            <AbsoluteFill>{a}</AbsoluteFill>
            <AbsoluteFill style={{ clipPath: clipB }}>{b}</AbsoluteFill>
            {ball && <Ball3DLayer balls={[ball]} />}
        </AbsoluteFill>
    )
}
