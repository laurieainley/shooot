// The signature motif: the REC dot blinks, is kicked, becomes a 3D football, curls into the top corner of the loud O,
// the net bulges, and the ball (red again) hops out to become the wordmark's full stop.
import { useCurrentFrame } from 'remotion'
import { C, clamp01, ease, lerp } from '../brand'
import { Ball3DLayer, type BallState } from './Ball3D'
import { DOT, LOUD_O, Wordmark, shoutOffsets, toScreen, unitScale, type Placement } from './Wordmark'

type Pt = { x: number; y: number }

export const MOTIF = {
    blinkEnd: 16,
    kick: 24,
    impact: 56,
    redBy: 63,
    land: 80,
    settled: 92,
} as const
/** Frames from the start of the full motif to the ball hitting the net (align this with a beat / the drop). */
export const MOTIF_IMPACT = MOTIF.impact

function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
    const u = 1 - t
    return {
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    }
}

export type MotifProps = {
    placement: Placement
    /** Where the REC dot starts (screen px) and its radius. */
    from: Pt
    fromR: number
    /** Speed factor: 1 = the reveal; the end card can run slower (e.g. 1.25). */
    slow?: number
    /** Wordmark already fully drawn (no shout), e.g. the end card after a cut. */
    noShout?: boolean
    /** Blink the dot at the start. */
    blink?: boolean
}

type Frame = {
    ball: BallState | null
    dot: { x: number; y: number; sx: number; sy: number; r: number } | null
    shout2: number
    shout3: number
    reveal: number
    netTau?: number
    netOpacity: number
    showWordDot: boolean
    occlude: boolean
    strike: number
}

export function motifFrame(f: number, p: MotifProps): Frame {
    const s = p.slow ?? 1
    const M = (n: number): number => n * s
    const k = unitScale(p.placement)
    const impactBall = toScreen(LOUD_O.ballAtImpact, p.placement)
    const impactR = LOUD_O.ballRadiusAtImpact * k
    // Where the full stop finally sits (after the shout, T fully across).
    const off = shoutOffsets(1, 1)
    const stop = toScreen({ x: DOT.x + off.t, y: DOT.y }, p.placement)
    const stopR = DOT.r * k

    const shout2 = p.noShout ? 1 : prog(f, M(MOTIF.kick + 4), M(14), ease.quintOut)
    const shout3 = p.noShout ? 1 : prog(f, M(MOTIF.kick + 12), M(16), ease.quintOut)
    const reveal = p.noShout ? 1 : prog(f, M(MOTIF.kick - 2), M(12), ease.out)

    const out: Frame = {
        ball: null, dot: null, shout2, shout3, reveal, netOpacity: 0, showWordDot: false, occlude: false, strike: 0,
    }

    // 1 · Blink + anticipation
    if (f < M(MOTIF.kick)) {
        const blinkOn = !p.blink || f >= M(MOTIF.blinkEnd) || Math.floor(f / 8) % 2 === 0
        const a = prog(f, M(MOTIF.blinkEnd), M(MOTIF.kick - MOTIF.blinkEnd), ease.out)
        out.dot = blinkOn
            ? { x: p.from.x - 10 * a, y: p.from.y + 4 * a, sx: 1 + 0.22 * a, sy: 1 - 0.18 * a, r: p.fromR }
            : null
        return out
    }

    // 2 · Flight
    const tFlight = (f - M(MOTIF.kick)) / M(MOTIF.impact - MOTIF.kick)
    out.strike = clamp01(1 - (f - M(MOTIF.kick)) / M(7))
    if (tFlight < 1) {
        const t = Easing01(tFlight)
        const p0 = p.from
        const p3 = impactBall
        const dx = p3.x - p0.x
        const p1 = { x: p0.x + dx * 0.15, y: Math.min(p0.y, p3.y) - 260 }
        const p2 = { x: p3.x - dx * 0.05 - 120, y: p3.y - 340 }
        const pos = bez(p0, p1, p2, p3, t)
        const ahead = bez(p0, p1, p2, p3, Math.min(1, t + 0.02))
        const dir = Math.atan2(ahead.y - pos.y, ahead.x - pos.x)
        // Towards the camera then away into the goal.
        const peak = Math.max(p.fromR * 3.2, impactR * 6)
        const grow = Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 0.8
        const base = lerp(p.fromR, impactR, ease.quintInOut(t))
        const r = base + (peak - base) * grow * (1 - t * 0.6)
        const speed = Math.hypot(ahead.x - pos.x, ahead.y - pos.y) * 50 / M(MOTIF.impact - MOTIF.kick)
        out.ball = {
            x: pos.x, y: pos.y, r,
            rx: t * 9, ry: t * 13, rz: t * 2,
            red: 1 - clamp01(tFlight / 0.2),
            stretch: 1 + Math.min(0.14, speed / Math.max(r, 1) * 0.1),
            dir,
        }
        out.occlude = t > 0.8
        out.netOpacity = 0.45 * clamp01((tFlight - 0.75) / 0.25)
        return out
    }

    // 3 · Impact: net bulges, the ball squashes into the corner and turns red, shrinking to a dot
    const tau = (f - M(MOTIF.impact)) / s
    out.netTau = tau
    out.netOpacity = 0.45 * (1 - prog(tau, 10, 22, ease.out))
    out.occlude = true
    const toRed = clamp01((tau - 3) / (MOTIF.redBy - MOTIF.impact - 3))
    const hopStart = MOTIF.redBy - MOTIF.impact
    if (tau < hopStart) {
        const push = Math.sin(Math.PI * clamp01(tau / 7)) * 0.4
        const toDir = Math.atan2(-11, 10)
        const into = toScreen({ x: LOUD_O.ballAtImpact.x + 5 * push, y: LOUD_O.ballAtImpact.y - 5 * push }, p.placement)
        out.ball = {
            x: into.x, y: into.y,
            r: lerp(impactR, stopR, ease.out(toRed)),
            rx: 9 + tau * 0.12, ry: 13 + tau * 0.18, rz: 2,
            red: ease.out(toRed),
            stretch: 1 - push * 0.45,
            dir: toDir,
        }
        return out
    }

    // 4 · Hop out to the full stop, small bounce, settle
    const start = toScreen({ x: LOUD_O.ballAtImpact.x, y: LOUD_O.ballAtImpact.y }, p.placement)
    const hopDur = MOTIF.land - MOTIF.redBy
    const th = clamp01((tau - hopStart) / hopDur)
    if (th < 1) {
        const x = lerp(start.x, stop.x, ease.quintInOut(th))
        const arc = 150 * k * 4 * th * (1 - th)
        const y = lerp(start.y, stop.y, th * th) - arc
        out.dot = { x, y, sx: 1, sy: 1, r: stopR }
        return out
    }
    const tl = tau - (MOTIF.land - MOTIF.impact)
    const settleDur = MOTIF.settled - MOTIF.land
    if (tl < settleDur) {
        const squash = Math.exp(-tl / 3) * Math.cos(tl * 0.9)
        const bounceT = clamp01((tl - 3) / 7)
        const hop = tl > 3 && tl < 10 ? 16 * k * 4 * bounceT * (1 - bounceT) : 0
        out.dot = { x: stop.x, y: stop.y - hop + stopR * 0.25 * Math.max(0, squash), sx: 1 + 0.3 * Math.max(0, squash), sy: 1 - 0.3 * Math.max(0, squash), r: stopR }
        return out
    }
    out.showWordDot = true
    return out
}

/** Struck-ball timing: fast off the boot, easing into the net. */
function Easing01(t: number): number {
    return 1 - Math.pow(1 - clamp01(t), 2.2)
}

function prog(f: number, start: number, dur: number, fn: (t: number) => number): number {
    return fn(clamp01((f - start) / dur))
}

/** Three short chalk marks behind the dot at the moment it is struck. */
function Strike({ at, r, amount }: { at: Pt; r: number; amount: number }): React.ReactElement | null {
    if (amount <= 0) return null
    const grow = 1 - amount
    return (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
            {[-0.5, 0, 0.5].map((a, i) => {
                const ang = Math.PI + a
                const r0 = r * (1.6 + grow * 1.2)
                const r1 = r * (2.4 + grow * 2.2)
                return (
                    <line
                        key={i}
                        x1={at.x + Math.cos(ang) * r0}
                        y1={at.y + Math.sin(ang) * r0}
                        x2={at.x + Math.cos(ang) * r1}
                        y2={at.y + Math.sin(ang) * r1}
                        stroke={C.chalk}
                        strokeWidth={Math.max(3, r * 0.22)}
                        strokeLinecap="round"
                        opacity={amount * 0.8}
                    />
                )
            })}
        </svg>
    )
}

export function Motif(props: MotifProps & { wordmarkOpacity?: number; frameOffset?: number; hideDotAfter?: number }): React.ReactElement {
    const f = useCurrentFrame() + (props.frameOffset ?? 0)
    const st = motifFrame(f, props)
    const showMark = props.noShout || f >= (MOTIF.kick - 2) * (props.slow ?? 1)
    return (
        <>
            {showMark && (
                <Wordmark
                    placement={props.placement}
                    shout2={st.shout2}
                    shout3={st.shout3}
                    reveal={st.reveal}
                    netTau={st.netTau}
                    netOpacity={st.netOpacity}
                    showDot={st.showWordDot && (props.hideDotAfter === undefined || f < props.hideDotAfter)}
                    opacity={props.wordmarkOpacity ?? 1}
                />
            )}
            <Strike at={props.from} r={props.fromR} amount={st.strike} />
            {st.ball && <Ball3DLayer balls={[st.ball]} />}
            {showMark && st.occlude && st.ball && (
                <Wordmark placement={props.placement} shout2={st.shout2} shout3={st.shout3} reveal={st.reveal} netTau={st.netTau} onlyLoudO showDot={false} />
            )}
            {st.dot && (
                <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
                    <ellipse cx={st.dot.x} cy={st.dot.y} rx={st.dot.r * st.dot.sx} ry={st.dot.r * st.dot.sy} fill={C.rec} />
                </svg>
            )}
        </>
    )
}
