// The problem, as flat brand illustrations: chalk line work on Night Turf, muted fills, the one red REC dot.
import { useCurrentFrame } from 'remotion'
import { C, FONT, MONO, clamp01, ease, lerp, voice } from '../brand'
import { recOn } from './Chrome'

const STROKE = { stroke: C.chalk, strokeWidth: 5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

/** A kit bag with a phone stuck in the zip, filming the inside of the bag. */
export function PhoneInBag({ x, y, s = 1, appear = 1 }: { x: number; y: number; s?: number; appear?: number }): React.ReactElement {
    const f = useCurrentFrame()
    const bob = Math.sin(f / 9) * 4
    const a = ease.backOut(clamp01(appear))
    return (
        <svg width={520} height={420} viewBox="0 0 520 420" style={{ position: 'absolute', left: x - 260 * s, top: y - 210 * s, transform: `scale(${s * a})`, transformOrigin: '50% 100%', overflow: 'visible' }}>
            {/* phone, mostly hidden in the zip, camera pointing in */}
            <g transform={`translate(270 ${92 + bob}) rotate(14)`}>
                <rect x={-34} y={-70} width={68} height={130} rx={12} fill={C.surface2} {...STROKE} />
                <rect x={-24} y={-58} width={48} height={92} rx={6} fill={C.ground} />
                <circle cx={-10} cy={-44} r={4} fill={recOn(f) ? C.rec : C.surface2} />
                <text x={2} y={-40} fill={C.chalk} fontFamily={FONT.mono} fontSize={10} fontWeight={700}>REC</text>
            </g>
            {/* bag body */}
            <path d="M70 170 Q70 140 100 140 L420 140 Q450 140 450 170 L470 360 Q472 385 446 385 L74 385 Q48 385 50 360 Z" fill={C.surface} {...STROKE} />
            <path d="M150 140 Q150 60 260 60 Q370 60 370 140" fill="none" {...STROKE} strokeWidth={9} />
            <path d="M90 168 L430 168" {...STROKE} strokeDasharray="10 9" strokeWidth={3} />
            <path d="M120 250 L400 250" {...STROKE} opacity={0.35} />
        </svg>
    )
}

/** A water bottle with a GoPro balanced on top, wobbling, recording. */
export function GoProOnBottle({ x, y, s = 1, appear = 1 }: { x: number; y: number; s?: number; appear?: number }): React.ReactElement {
    const f = useCurrentFrame()
    const wob = Math.sin(f / 5) * 4 + Math.sin(f / 13) * 3
    const a = ease.backOut(clamp01(appear))
    return (
        <svg width={360} height={520} viewBox="0 0 360 520" style={{ position: 'absolute', left: x - 180 * s, top: y - 260 * s, transform: `scale(${s * a})`, transformOrigin: '50% 100%', overflow: 'visible' }}>
            <rect x={130} y={180} width={100} height={320} rx={30} fill={C.surface} {...STROKE} />
            <rect x={150} y={150} width={60} height={36} rx={8} fill={C.surface2} {...STROKE} />
            <path d="M140 300 L220 300" {...STROKE} opacity={0.35} />
            <path d="M140 330 L220 330" {...STROKE} opacity={0.35} />
            <g transform={`translate(180 150) rotate(${wob}) translate(-180 -150)`}>
                <rect x={110} y={58} width={140} height={92} rx={14} fill={C.surface2} {...STROKE} />
                <circle cx={152} cy={104} r={28} fill={C.ground} {...STROKE} />
                <circle cx={152} cy={104} r={12} fill={C.line} />
                <rect x={198} y={74} width={36} height={20} rx={4} fill={C.ground} />
                {recOn(f) && <circle cx={230} cy={128} r={7} fill={C.rec} />}
            </g>
        </svg>
    )
}

/** The hour of footage piling up: a mono counter racing to 60:00. */
export function HourCounter({ x, y, from, dur }: { x: number; y: number; from: number; dur: number }): React.ReactElement {
    const f = useCurrentFrame()
    const p = ease.quintInOut(clamp01((f - from) / dur))
    const secs = Math.floor(p * 3600)
    const mm = String(Math.floor(secs / 60)).padStart(2, '0')
    const ss = String(secs % 60).padStart(2, '0')
    return (
        <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <div style={{ ...MONO, fontSize: 132, color: C.chalk, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</div>
            <div style={{ ...MONO, fontWeight: 400, fontSize: 24, letterSpacing: '0.3em', color: C.muted, marginTop: 4 }}>OF FOOTAGE. EVERY WEEK.</div>
        </div>
    )
}

/** A generic grey editing timeline that multiplies out of control, then an export dialog that will never finish. */
export function ExplodingEditor({ start, dialogAt }: { start: number; dialogAt: number }): React.ReactElement {
    const f = useCurrentFrame() - start
    const grow = ease.expoIn(clamp01(f / 34))
    const burst = ease.expoOut(clamp01((f - 30) / 26))
    const tracks = 6
    const clipsPerTrack = Math.round(lerp(4, 46, grow))
    const zoomOut = lerp(1, 0.78, ease.out(clamp01(f / 70)))
    const d = f - (dialogAt - start)
    const dlg = ease.backOut(clamp01(d / 10))
    const spin = d * 14
    const rnd = (i: number): number => {
        const v = Math.sin(i * 12.9898) * 43758.5453
        return v - Math.floor(v)
    }
    return (
        <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', left: 160, top: 210, width: 1600, height: 660, borderRadius: 14, background: '#1c2220', border: `2px solid ${C.line}`, overflow: 'visible', transform: `scale(${zoomOut}) rotate(${-1.5 * grow}deg)`, filter: d > 0 ? `brightness(${1 - 0.45 * dlg})` : undefined }}>
                <div style={{ height: 320, borderBottom: `2px solid ${C.line}`, display: 'flex' }}>
                    <div style={{ flex: 1, margin: 20, borderRadius: 8, background: '#262d2a' }} />
                    <div style={{ width: 360, margin: 20, borderRadius: 8, background: '#262d2a' }} />
                </div>
                <div style={{ position: 'absolute', top: 340, left: 20, right: 20, height: 18, display: 'flex', gap: 2 }}>
                    {Array.from({ length: 60 }).map((_, i) => <div key={i} style={{ flex: 1, borderLeft: `2px solid ${C.line}` }} />)}
                </div>
                {Array.from({ length: tracks }).map((_, t) => (
                    <div key={t} style={{ position: 'absolute', top: 372 + t * 46, left: 20, right: 20, height: 38, overflow: 'visible' }}>
                        {Array.from({ length: clipsPerTrack }).map((__, c) => {
                            const w = 1520 / Math.max(4, clipsPerTrack * 0.6) * (0.5 + rnd(t * 100 + c))
                            const left = (c / clipsPerTrack) * 1560 * lerp(1, 1.6, grow) - grow * 200 * rnd(t + c)
                            const ang = rnd(t * 31 + c * 7) * Math.PI * 2
                            const dist = (220 + 520 * rnd(t * 17 + c * 3)) * burst
                            const rot = (rnd(t + c * 13) - 0.5) * 70 * burst
                            return <div key={c} style={{ position: 'absolute', left, width: w, height: 38, borderRadius: 5, background: ['#3a423e', '#465049', '#343b38'][(t + c) % 3], border: '1px solid #3b433f', transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist * 0.7}px) rotate(${rot}deg)` }} />
                        })}
                    </div>
                ))}
                <div style={{ position: 'absolute', top: 330, bottom: 0, left: 20 + 1560 * lerp(0.2, 1.4, grow), width: 3, background: C.muted }} />
            </div>
            {d > 0 && (
                <div style={{ position: 'absolute', left: 960, top: 540, transform: `translate(-50%, -50%) scale(${dlg})`, width: 640, padding: '34px 40px', borderRadius: 16, background: C.surface, border: `2px solid ${C.line}`, boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                        <svg width={46} height={46} viewBox="0 0 46 46" style={{ transform: `rotate(${spin}deg)` }}>
                            <circle cx={23} cy={23} r={18} fill="none" stroke={C.line} strokeWidth={6} />
                            <path d="M23 5 A18 18 0 0 1 41 23" fill="none" stroke={C.muted} strokeWidth={6} strokeLinecap="round" />
                        </svg>
                        <div>
                            <div style={{ fontFamily: FONT.archivo, fontWeight: 700, fontSize: 30, color: C.chalk }}>Exporting…</div>
                            <div style={{ ...MONO, fontWeight: 400, fontSize: 22, color: C.muted, marginTop: 4 }}>4h 12m remaining</div>
                        </div>
                    </div>
                    <div style={{ marginTop: 24, height: 10, borderRadius: 5, background: C.ground }}>
                        <div style={{ width: `${lerp(1, 3, clamp01(d / 60))}%`, height: 10, borderRadius: 5, background: C.muted }} />
                    </div>
                </div>
            )}
        </div>
    )
}

/** Mono caption under an illustration. */
export function GagLabel({ text, x, y, appear }: { text: string; x: number; y: number; appear: number }): React.ReactElement {
    return (
        <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, 0)', opacity: clamp01(appear), ...voice('heading'), fontSize: 46, color: C.chalk, whiteSpace: 'nowrap', clipPath: `inset(-20% ${(1 - ease.expoOut(clamp01(appear))) * 100}% -20% 0)` }}>
            {text}
        </div>
    )
}
