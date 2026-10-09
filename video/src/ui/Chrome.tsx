// Small pieces of on-screen furniture: the REC viewfinder, freeze-frame outline, browser frame, cursor, keycaps,
// step labels.
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C, MONO, clamp01, ease, lerp, voice } from '../brand'

export const REC_POS = { x: 124, y: 104, r: 13 } as const

/** Blinking: on for 18 frames of every 30 (period divides the 18 s loop, so the teaser seam is invisible). */
export const recOn = (absFrame: number): boolean => ((absFrame % 30) + 30) % 30 < 18

export function RecBadge({ absFrame, opacity = 1, label = 'REC', dot = true, clock }: { absFrame: number; opacity?: number; label?: string; dot?: boolean; clock?: string }): React.ReactElement {
    return (
        <AbsoluteFill style={{ opacity }}>
            {dot && recOn(absFrame) && (
                <div style={{ position: 'absolute', left: REC_POS.x - REC_POS.r, top: REC_POS.y - REC_POS.r, width: REC_POS.r * 2, height: REC_POS.r * 2, borderRadius: '50%', background: C.rec }} />
            )}
            <div style={{ position: 'absolute', left: REC_POS.x + 26, top: REC_POS.y, transform: 'translateY(-50%)', ...MONO, fontSize: 26, letterSpacing: '0.14em', color: C.chalk }}>
                {label}
                {clock && <span style={{ color: C.muted, marginLeft: 22, fontWeight: 400 }}>{clock}</span>}
            </div>
        </AbsoluteFill>
    )
}

/** Viewfinder corner brackets. */
export function Brackets({ opacity = 1, inset = 56 }: { opacity?: number; inset?: number }): React.ReactElement {
    const L = 46
    const s = { stroke: C.chalk, strokeWidth: 3, fill: 'none', opacity: 0.55 }
    const x0 = inset, y0 = inset, x1 = 1920 - inset, y1 = 1080 - inset
    return (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity }}>
            <path d={`M${x0} ${y0 + L}V${y0}H${x0 + L}M${x1 - L} ${y0}H${x1}V${y0 + L}M${x1} ${y1 - L}V${y1}H${x1 - L}M${x0 + L} ${y1}H${x0}V${y1 - L}`} {...s} />
        </svg>
    )
}

/**
 * Freeze-frame treatment: the picture steps back a touch and a lime outline is traced around it (from the top-left,
 * clockwise), like a moment being marked. `at` = local frame of the freeze.
 */
export function FreezeOutline({ at, children, outAt }: { at: number; children: React.ReactNode; outAt?: number }): React.ReactElement {
    const f = useCurrentFrame()
    const p = ease.expoOut(clamp01((f - at) / 10))
    const o = clamp01((f - at) / 12)
    const back = outAt === undefined ? 0 : ease.expoIn(clamp01((f - outAt) / 6))
    const s = lerp(1, 0.9, p) * lerp(1, 1.04, back)
    const w = 1920 * s
    const h = 1080 * s
    const x = (1920 - w) / 2
    const y = (1080 - h) / 2
    return (
        <AbsoluteFill style={{ background: C.ground }}>
            <AbsoluteFill style={{ transform: `scale(${s})`, filter: p > 0 ? `saturate(${1 - 0.35 * p}) brightness(${1 - 0.12 * p})` : undefined }}>{children}</AbsoluteFill>
            {f >= at && (
                <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 1 - back }}>
                    <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="none" stroke={C.lime} strokeWidth={8} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ease.quintOut(o)} />
                </svg>
            )}
        </AbsoluteFill>
    )
}

/** A floating browser window, tilted in 3D, with a soft shadow. Children fill the page area (16:9). */
export function BrowserFrame({ width = 1500, rx = 6, ry = -9, rz = 0, x = 960, y = 560, scale = 1, url = 'editor.shooot.co.uk', children }: {
    width?: number; rx?: number; ry?: number; rz?: number; x?: number; y?: number; scale?: number; url?: string; children: React.ReactNode
}): React.ReactElement {
    const bar = 44
    const h = (width * 9) / 16 + bar
    return (
        <div style={{ position: 'absolute', left: x, top: y, width, height: h, transform: `translate(-50%, -50%) perspective(2600px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`, transformStyle: 'preserve-3d' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: C.surface, boxShadow: '0 70px 140px rgba(0,0,0,0.6), 0 20px 40px rgba(0,0,0,0.35)', border: `1px solid ${C.line}`, overflow: 'hidden' }}>
                <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: C.surface, borderBottom: `1px solid ${C.line}` }}>
                    {[0, 1, 2].map((i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: C.line }} />)}
                    <div style={{ marginLeft: 18, flex: 1, maxWidth: 520, height: 28, borderRadius: 8, background: C.ground, display: 'flex', alignItems: 'center', padding: '0 14px', ...MONO, fontWeight: 400, fontSize: 16, color: C.muted }}>
                        {url}
                    </div>
                </div>
                <div style={{ position: 'relative', width, height: h - bar, overflow: 'hidden', background: C.ground }}>{children}</div>
            </div>
        </div>
    )
}

/** Pointer arrow; `press` 0→1 shrinks it slightly and fires a ring. */
export function Cursor({ x, y, press = 0, ring = 0 }: { x: number; y: number; press?: number; ring?: number }): React.ReactElement {
    const s = 1 - 0.12 * press
    return (
        <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
            {ring > 0 && ring < 1 && (
                <div style={{ position: 'absolute', left: -30 * ring - 6, top: -30 * ring - 6, width: 60 * ring + 12, height: 60 * ring + 12, borderRadius: '50%', border: `3px solid ${C.chalk}`, opacity: 1 - ring }} />
            )}
            <svg width={44} height={52} viewBox="0 0 22 26" style={{ transform: `scale(${s})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.45))' }}>
                <path d="M2 2 L2 20 L7 15.5 L10.5 23.5 L13.5 22.2 L10.2 14.5 L17 14.5 Z" fill={C.chalk} stroke={C.ground} strokeWidth={1.4} strokeLinejoin="round" />
            </svg>
        </div>
    )
}

/** A keycap callout. `press` 0..1 (down), `lime` lights it as the goal key. */
export function Keycap({ k, x, y, size = 120, press = 0, lime = false, label, appear = 1 }: { k: string; x: number; y: number; size?: number; press?: number; lime?: boolean; label?: string; appear?: number }): React.ReactElement | null {
    if (appear <= 0) return null
    const lip = lerp(10, 3, press)
    const face = lime && press > 0.3 ? C.lime : C.surface2
    const ink = lime && press > 0.3 ? C.onLime : C.chalk
    const sc = ease.backOut(clamp01(appear))
    const wide = k.length > 1
    const w = wide ? size * 1.9 : size
    return (
        <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${sc})` }}>
            <div style={{ width: w, height: size, borderRadius: 18, background: face, border: `2px solid ${C.line}`, boxShadow: `0 ${lip}px 0 #070a08, 0 ${lip + 14}px 28px rgba(0,0,0,0.5)`, transform: `translateY(${10 - lip}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...MONO, fontSize: wide ? size * 0.32 : size * 0.46, color: ink }}>
                {k}
            </div>
            {label && (
                <div style={{ position: 'absolute', top: size + 26, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', ...MONO, fontSize: 22, letterSpacing: '0.12em', color: C.muted }}>{label}</div>
            )}
        </div>
    )
}

/** "01 FILM IT": mono step number + heading voice on a leaning lime slab. */
export function StepLabel({ n, text, inAt, outAt, x = 96, y = 112 }: { n: string; text: string; inAt: number; outAt?: number; x?: number; y?: number }): React.ReactElement | null {
    const f = useCurrentFrame()
    if (f < inAt) return null
    const g = ease.expoOut(clamp01((f - inAt) / 9))
    const t = ease.expoOut(clamp01((f - inAt - 4) / 10))
    const out = outAt === undefined ? 0 : ease.expoIn(clamp01((f - outAt) / 7))
    if (out >= 1) return null
    return (
        <div style={{ position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 18, clipPath: `inset(-20% ${out * 100}% -20% 0)` }}>
            <div style={{ ...MONO, fontSize: 30, color: C.lime, opacity: t, transform: `translateY(${(1 - t) * 10}px)` }}>{n}</div>
            <div style={{ transform: 'skewX(-10deg)', background: C.lime, padding: '8px 22px 6px', clipPath: `inset(0 ${(1 - g) * 100}% 0 0)` }}>
                <div style={{ transform: 'skewX(10deg)', ...voice('heading'), fontSize: 52, lineHeight: 1, color: C.onLime, opacity: t }}>{text}</div>
            </div>
        </div>
    )
}
