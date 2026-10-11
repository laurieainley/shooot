// Night Turf: the near-black ground with a hint of turf, an optional vignette and faint pitch markings.
import { AbsoluteFill } from 'remotion'
import { C, clamp01 } from '../brand'

/** Faint pitch markings (the app's card pitch, brand/tokens pitch colour). `draw` 0→1 draws the lines on. */
export function PitchLines({ draw = 1, opacity = 1, scale = 1 }: { draw?: number; opacity?: number; scale?: number }): React.ReactElement {
    const L = 64, T = 64, R = 1920 - 64, B = 1080 - 64, mx = 960, my = 540
    const d = clamp01(draw)
    const common = { stroke: C.pitch, strokeWidth: 4, fill: 'none', pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - d }
    return (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity, transform: `scale(${scale})` }}>
            <rect x={L} y={T} width={R - L} height={B - T} {...common} />
            <line x1={mx} y1={T} x2={mx} y2={B} {...common} />
            <circle cx={mx} cy={my} r={210} {...common} />
            <circle cx={mx} cy={my} r={8} fill={C.pitch} opacity={d} />
            <rect x={L} y={my - 330} width={330} height={660} {...common} />
            <rect x={R - 330} y={my - 330} width={330} height={660} {...common} />
            <rect x={L} y={my - 150} width={120} height={300} {...common} />
            <rect x={R - 120} y={my - 150} width={120} height={300} {...common} />
        </svg>
    )
}

export function Ground({ pitch = 0, pitchDraw = 1, children }: { pitch?: number; pitchDraw?: number; children?: React.ReactNode }): React.ReactElement {
    return (
        <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, ${C.surface} 0%, ${C.ground} 62%)` }}>
            {pitch > 0 && <PitchLines draw={pitchDraw} opacity={pitch} />}
            {children}
        </AbsoluteFill>
    )
}
