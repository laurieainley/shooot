// Real footage with editorial time control: any source-time curve (speed ramps, freeze frames) via Freeze, optional
// frame blending for slow motion, and a zoom window (replay zoom on the goal mouth). Falls back to a labelled placeholder.
import { AbsoluteFill, Freeze, OffthreadVideo, useCurrentFrame } from 'remotion'
import { C, FPS, MONO } from '../brand'
import { asset } from '../data/assets'
import { PitchLines } from './Ground'

export type Zoom = { scale: number; cx: number; cy: number }

type Props = {
    file: string
    available: boolean
    /** Source time (s) for a local frame. */
    timeAt: (frame: number) => number
    zoom?: (frame: number) => Zoom
    /** Blend neighbouring source frames when slowed down. */
    blend?: boolean
    label?: string
    /** Grade: a touch of contrast and a darker floor so graphics and text sit well. */
    dim?: number
}

const SRC_FPS = 30000 / 1001

function Frame({ file, t }: { file: string; t: number }): React.ReactElement {
    return (
        <Freeze frame={Math.max(0, t) * FPS}>
            <OffthreadVideo src={asset(file)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Freeze>
    )
}

export function Footage({ file, available, timeAt, zoom, blend = false, label, dim = 0 }: Props): React.ReactElement {
    const f = useCurrentFrame()
    const t = timeAt(f)
    const z = zoom?.(f) ?? { scale: 1, cx: 0.5, cy: 0.5 }
    const tx = (0.5 - z.cx) * 1920 * z.scale
    const ty = (0.5 - z.cy) * 1080 * z.scale
    // Clamp so the zoom never shows past the picture edge.
    const maxX = ((z.scale - 1) * 1920) / 2
    const maxY = ((z.scale - 1) * 1080) / 2
    const transform = `translate(${Math.max(-maxX, Math.min(maxX, tx))}px, ${Math.max(-maxY, Math.min(maxY, ty))}px) scale(${z.scale})`

    let body: React.ReactNode
    if (!available) {
        body = <FootagePlaceholder label={label ?? file} t={t} />
    } else if (blend) {
        const sf = t * SRC_FPS
        const a = Math.floor(sf)
        const w = sf - a
        body = (
            <>
                <AbsoluteFill><Frame file={file} t={(a + 0.02) / SRC_FPS} /></AbsoluteFill>
                {w > 0.15 && (
                    <AbsoluteFill style={{ opacity: w }}><Frame file={file} t={(a + 1.02) / SRC_FPS} /></AbsoluteFill>
                )}
            </>
        )
    } else body = <Frame file={file} t={t} />

    return (
        <AbsoluteFill style={{ overflow: 'hidden', background: C.ground }}>
            <AbsoluteFill style={{ transform, transformOrigin: '50% 50%' }}>{body}</AbsoluteFill>
            {dim > 0 && <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(11,15,13,${dim * 0.5}) 0%, rgba(11,15,13,${dim}) 100%)` }} />}
        </AbsoluteFill>
    )
}

function FootagePlaceholder({ label, t }: { label: string; t: number }): React.ReactElement {
    return (
        <AbsoluteFill style={{ background: `linear-gradient(160deg, #13201a, ${C.ground})` }}>
            <PitchLines opacity={0.8} />
            <div style={{ position: 'absolute', left: 96, bottom: 80, ...MONO, fontSize: 28, color: C.muted }}>
                FOOTAGE · {label} · {t.toFixed(2)}s
            </div>
        </AbsoluteFill>
    )
}
