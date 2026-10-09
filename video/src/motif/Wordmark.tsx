// The SHOOOT. wordmark from the outlined brand SVG, with two motion behaviours:
//  - shout: the 2nd and 3rd O grow in turn (SHOT → SHOOT → SHOOOT), the loud O turning lime as it arrives;
//  - net bulge: the loud O takes the ball in its top corner. Its outline stretches locally around the impact,
//    a diamond net mesh inside the counter ripples outwards from it, then everything settles (damped).
import { useId } from 'react'
import { C } from '../brand'
import { GLYPHS, WORDMARK_DOT, WORDMARK_VIEWBOX as VB } from '../wordmarkPaths'

export type Placement = { cx: number; cy: number; width: number }
type Pt = { x: number; y: number }

const VB_CX = VB.x + VB.w / 2
const VB_CY = VB.y + VB.h / 2

/** Wordmark units → screen px. */
export function toScreen(p: Pt, pl: Placement): Pt {
    const k = pl.width / VB.w
    return { x: pl.cx + (p.x - VB_CX) * k, y: pl.cy + (p.y - VB_CY) * k }
}
export const unitScale = (pl: Placement): number => pl.width / VB.w

/** Loud O (glyph O3) geometry in wordmark units. */
export const LOUD_O = {
    centre: { x: 569, y: -68.8 },
    /** The top-right corner of the counter: where the ball hits the net. */
    impact: { x: 598, y: -99 },
    /** Where the ball sits at the moment of impact (inside the counter). */
    ballAtImpact: { x: 588, y: -88 },
    ballRadiusAtImpact: 15,
    counterBox: { x0: 520, y0: -112, x1: 620, y1: -24 },
}
export const DOT = { x: WORDMARK_DOT.cx, y: WORDMARK_DOT.cy, r: WORDMARK_DOT.r }

/** Advances (wordmark units) used by the shout. */
const O2_ADV = 476 - 328
const O3_ADV = 673 - 476

/** Displacement amplitude of the net, τ frames after impact (out, recoil, settle). */
export function netAmp(tau: number): number {
    if (tau < 0) return 0
    return Math.exp(-tau / 8) * Math.sin((tau * 2 * Math.PI) / 17) * 1.45
}

function mapPath(d: string, f: (p: Pt) => Pt): string {
    const tokens = d.match(/[MLQCZTmlqczt]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
    const out: string[] = []
    const nums: number[] = []
    const flush = (): void => {
        for (let i = 0; i + 1 < nums.length; i += 2) {
            const p = f({ x: nums[i], y: nums[i + 1] })
            out.push(p.x.toFixed(2), p.y.toFixed(2))
        }
        nums.length = 0
    }
    for (const t of tokens) {
        if (/[A-Za-z]/.test(t)) {
            flush()
            out.push(t)
        } else nums.push(parseFloat(t))
    }
    flush()
    return out.join(' ')
}

const O3 = GLYPHS.find((g) => g.id === 'O3')!.d
const O3_INNER = O3.slice(O3.indexOf('ZM') + 1)

/** Outline push: points near the impact move away from the O's centre. */
function ringDisplace(tau: number) {
    const a = netAmp(tau)
    const { impact: P, centre: O } = LOUD_O
    return (q: Pt): Pt => {
        if (a === 0) return q
        const dx = q.x - P.x
        const dy = q.y - P.y
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * 38 * 38))
        const ox = q.x - O.x
        const oy = q.y - O.y
        const len = Math.hypot(ox, oy) || 1
        return { x: q.x + (ox / len) * a * w * 22, y: q.y + (oy / len) * a * w * 22 }
    }
}

/** Net points: a travelling ripple from the impact, pulling the mesh towards the corner (the net stretching back). */
function netDisplace(tau: number) {
    const { impact: P, centre: O } = LOUD_O
    const ux = P.x - O.x
    const uy = P.y - O.y
    const ul = Math.hypot(ux, uy)
    return (q: Pt): Pt => {
        const dx = q.x - P.x
        const dy = q.y - P.y
        const dist = Math.hypot(dx, dy)
        const a = netAmp(tau - dist / 9)
        if (a === 0) return q
        const w = Math.exp(-(dist * dist) / (2 * 34 * 34))
        const m = a * w * 16
        return { x: q.x + (ux / ul) * m, y: q.y + (uy / ul) * m }
    }
}

function netLines(tau: number): string {
    const f = netDisplace(tau)
    const { x0, y0, x1, y1 } = LOUD_O.counterBox
    const step = 9
    const span = x1 - x0 + (y1 - y0)
    const paths: string[] = []
    for (const sign of [1, -1]) {
        for (let o = -span; o <= span; o += step) {
            const pts: string[] = []
            for (let s = 0; s <= 1.0001; s += 0.04) {
                const y = y0 + (y1 - y0) * s
                const x = (sign > 0 ? x0 : x1) + sign * (o + (y - y0))
                if (x < x0 - 10 || x > x1 + 10) continue
                const p = f({ x, y })
                pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            }
            if (pts.length > 1) paths.push(`M${pts.join('L')}`)
        }
    }
    return paths.join('')
}

export type WordmarkProps = {
    placement: Placement
    /** 0 → 1: the 2nd O grows. */
    shout2?: number
    /** 0 → 1: the 3rd O grows and turns lime. */
    shout3?: number
    /** Frames since the ball hit the net (undefined = no bulge). */
    netTau?: number
    /** Opacity of the net mesh. */
    netOpacity?: number
    /** Show the full stop. */
    showDot?: boolean
    /** Per-glyph reveal (0..1) for a left-to-right wipe-in; 1 = all shown. */
    reveal?: number
    /** Draw only the loud O ring (an occlusion layer above the ball). */
    onlyLoudO?: boolean
    opacity?: number
}

/** Horizontal shift of each glyph during the shout, and the whole-mark recentring. */
function shoutLayout(s2: number, s3: number): { o2: number; o3: number; t: number; centre: number } {
    const missing2 = (1 - s2) * O2_ADV
    const missing3 = (1 - s3) * O3_ADV
    return { o2: 0, o3: -missing2, t: -missing2 - missing3, centre: (missing2 + missing3) / 2 }
}

export function shoutOffsets(s2: number, s3: number): { o3: number; t: number; centre: number } {
    return shoutLayout(s2, s3)
}

function mix(a: string, b: string, t: number): string {
    const pa = parseInt(a.slice(1), 16)
    const pb = parseInt(b.slice(1), 16)
    const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t)
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

export function Wordmark({ placement, shout2 = 1, shout3 = 1, netTau, netOpacity = 0, showDot = true, reveal = 1, onlyLoudO = false, opacity = 1 }: WordmarkProps): React.ReactElement {
    const k = unitScale(placement)
    const lay = shoutLayout(shout2, shout3)
    const tx = placement.cx - VB_CX * k + lay.centre * k
    const ty = placement.cy - VB_CY * k
    const tau = netTau ?? -1
    const ring = ringDisplace(tau)
    const o3d = tau >= 0 ? mapPath(O3, ring) : O3
    const o3inner = tau >= 0 ? mapPath(O3_INNER, ring) : O3_INNER
    const a = netAmp(tau)
    const sx = 1 + 0.06 * Math.max(0, a)
    const sy = 1 + 0.025 * Math.max(0, a)
    const ox = 476 + 0.3 * 186
    const oy = LOUD_O.centre.y
    const loudFill = mix(C.chalk, C.lime, Math.min(1, Math.max(0, (shout3 - 0.55) / 0.45)))
    const glyphShift = (id: string): number => (id === 'O3' ? lay.o3 : id === 'T' ? lay.t : 0)
    const glyphScale = (id: string): number => (id === 'O2' ? shout2 : id === 'O3' ? shout3 : 1)
    const glyphLeft: Record<string, number> = { S: 1, H: 101, O1: 220, O2: 328, O3: 476, T: 673 }
    const order = ['S', 'H', 'O1', 'O2', 'O3', 'T']
    const clipId = `counter${useId().replace(/:/g, '')}`
    return (
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity }}>
            <defs>
                <clipPath id={clipId}>
                    <path d={o3inner} />
                </clipPath>
            </defs>
            <g transform={`translate(${tx} ${ty}) scale(${k})`}>
                {!onlyLoudO &&
                    order.filter((id) => id !== 'O3').map((id, i) => {
                        const g = GLYPHS.find((x) => x.id === id)!
                        const vis = Math.max(0, Math.min(1, reveal * order.length - i))
                        const sc = glyphScale(id)
                        if (sc <= 0.001 || vis <= 0) return null
                        const l = glyphLeft[id]
                        return (
                            <path
                                key={id}
                                d={g.d}
                                fill={C.chalk}
                                opacity={vis}
                                transform={`translate(${glyphShift(id)} 0) translate(${l} 0) scale(${sc} 1) translate(${-l} 0)`}
                            />
                        )
                    })}
                {shout3 > 0.001 && reveal * order.length > 4 && (
                    <g transform={`translate(${lay.o3} 0) translate(476 0) scale(${shout3} 1) translate(-476 0)`} opacity={Math.max(0, Math.min(1, reveal * order.length - 4))}>
                        <g transform={`translate(${ox} ${oy}) scale(${sx} ${sy}) translate(${-ox} ${-oy})`}>
                            {!onlyLoudO && netOpacity > 0 && (
                                <path d={netLines(tau)} clipPath={`url(#${clipId})`} stroke={C.chalk} strokeWidth={1.1} fill="none" opacity={netOpacity} />
                            )}
                            <path d={o3d} fill={loudFill} fillRule="evenodd" />
                        </g>
                    </g>
                )}
                {!onlyLoudO && showDot && <circle cx={DOT.x + lay.t} cy={DOT.y} r={DOT.r} fill={C.rec} />}
            </g>
        </svg>
    )
}
