// A real editor screen recording in the floating browser frame, with keycap callouts from its key log and a
// stylised cursor from its pointer log.
import { AbsoluteFill, Freeze, OffthreadVideo, useCurrentFrame } from 'remotion'
import { C, FPS, MONO, clamp01, ease, lerp } from '../brand'
import { asset, type Capture, type CursorEvent } from '../data/assets'
import { Cursor, Keycap } from './Chrome'
import type { Zoom } from './Footage'

const STEP_LABEL = (s?: string): string | undefined => {
    if (!s) return undefined
    const [k, v] = s.split('=')
    if (k === 'type') return v.toUpperCase()
    if (k === 'team') return v.toUpperCase()
    if (k === 'scorer') return v.toUpperCase()
    if (k === 'assist') return `ASSIST · ${v.toUpperCase()}`
    return undefined
}

const KEY_GLYPH: Record<string, string> = { Enter: '⏎', Space: 'SPACE', Tab: 'TAB', Esc: 'ESC' }

type Props = {
    cap?: Capture
    label: string
    /** Source seconds for a local frame. */
    timeAt: (f: number) => number
    zoom?: (f: number) => Zoom
    /** Show keycaps for these keys only (default: all but Space/Esc). */
    keys?: string[]
    /** Where the keycap callout sits (screen px). */
    keyPos?: { x: number; y: number }
    frame: { width: number; x: number; y: number; rx: number; ry: number }
    children?: React.ReactNode
}

/** Pointer position at source time t (eased between logged points). */
function pointerAt(ev: CursorEvent[], t: number): { x: number; y: number; press: number; ring: number } | null {
    const pts = ev.filter((e) => e.type !== 'step' && e.type !== 'key')
    if (pts.length < 2 || !ev.some((e) => e.type === 'move' || e.type === 'down')) return null
    let i = pts.findIndex((p) => p.t > t)
    if (i <= 0) i = i === 0 ? 1 : pts.length - 1
    const a = pts[i - 1]
    const b = pts[i]
    const u = ease.quintInOut(clamp01((t - a.t) / Math.max(0.001, b.t - a.t)))
    const downs = ev.filter((e) => e.type === 'down')
    const last = downs.filter((d) => d.t <= t).pop()
    const since = last ? t - last.t : 99
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), press: since < 0.15 ? 1 - since / 0.15 : 0, ring: since < 0.45 ? since / 0.45 : 0 }
}

export function CaptureClip({ cap, label, timeAt, zoom, keys, keyPos = { x: 1690, y: 860 }, frame, children }: Props): React.ReactElement {
    const f = useCurrentFrame()
    const t = timeAt(f)
    const z = zoom?.(f) ?? { scale: 1, cx: 0.5, cy: 0.5 }
    const w = frame.width
    const h = (w * 9) / 16
    const k = w / 1920
    const ptr = cap ? pointerAt(cap.events, t) : null
    const keyEvents = (cap?.events ?? []).filter((e) => e.type === 'key' && (keys ? keys.includes(e.key ?? '') : !['Space', 'Esc'].includes(e.key ?? '')))
    // The most recent key within 1.1 s, with the step it produced.
    const current = keyEvents.filter((e) => e.t <= t + 0.12 && t - e.t < 1.1).pop()
    const step = current ? cap!.events.find((e) => e.type === 'step' && Math.abs(e.t - current.t) < 0.1) : undefined
    const press = current ? (t < current.t ? 1 - (current.t - t) / 0.12 : clamp01(1 - (t - current.t) / 0.25)) : 0
    const appear = current ? clamp01((t - current.t + 0.12) / 0.2) * clamp01((1.1 - (t - current.t)) / 0.15) : 0

    return (
        <>
            <div style={{ position: 'absolute', left: frame.x, top: frame.y, width: w, height: h + 44, transform: `translate(-50%, -50%) perspective(2600px) rotateX(${frame.rx}deg) rotateY(${frame.ry}deg)` }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: C.surface, boxShadow: '0 70px 140px rgba(0,0,0,0.6), 0 20px 40px rgba(0,0,0,0.35)', border: `1px solid ${C.line}`, overflow: 'hidden' }}>
                    <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', borderBottom: `1px solid ${C.line}` }}>
                        {[0, 1, 2].map((i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: C.line }} />)}
                        <div style={{ marginLeft: 18, width: 460, height: 28, borderRadius: 8, background: C.ground, display: 'flex', alignItems: 'center', padding: '0 14px', ...MONO, fontWeight: 400, fontSize: 16, color: C.muted }}>editor.shooot.co.uk</div>
                    </div>
                    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: C.ground }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `scale(${k})` }}>
                            <AbsoluteFill style={{ transform: `scale(${z.scale})`, transformOrigin: `${z.cx * 100}% ${z.cy * 100}%` }}>
                                {cap ? (
                                    <Freeze frame={Math.max(0, t) * FPS}>
                                        <OffthreadVideo src={asset(cap.file)} muted style={{ width: 1920, height: 1080 }} />
                                    </Freeze>
                                ) : (
                                    <AbsoluteFill style={{ background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', ...MONO, fontSize: 40, color: C.muted }}>
                                        CAPTURE · {label} · {t.toFixed(1)}s
                                    </AbsoluteFill>
                                )}
                                {ptr && <Cursor x={ptr.x} y={ptr.y} press={ptr.press} ring={ptr.ring} />}
                            </AbsoluteFill>
                        </div>
                        {children}
                    </div>
                </div>
            </div>
            {current && (
                <Keycap
                    k={KEY_GLYPH[current.key ?? ''] ?? current.key ?? ''}
                    x={keyPos.x}
                    y={keyPos.y}
                    size={128}
                    press={press}
                    lime={current.key === 'G'}
                    label={current.key === 'G' ? 'MARK' : STEP_LABEL(step?.step)}
                    appear={appear}
                />
            )}
        </>
    )
}
