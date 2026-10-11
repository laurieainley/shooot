// On-screen type with editorial motion: mask wipes (like a trim), lime slabs that lean -10°, strike-throughs.
import { useCurrentFrame } from 'remotion'
import { C, MONO, clamp01, ease, voice } from '../brand'

type Pos = { x: number; y: number; align?: 'left' | 'center' | 'right' }

const anchor = (align: Pos['align']): string => (align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0')

/** Wipe in (left → right) at `inAt`, wipe out (left → right, the trailing edge chasing) at `outAt`. */
export function wipe(f: number, inAt: number, outAt: number | undefined, dur = 9): string {
    const a = ease.expoOut(clamp01((f - inAt) / dur))
    const b = outAt === undefined ? 0 : ease.expoIn(clamp01((f - outAt) / (dur * 0.8)))
    return `inset(-20% ${(1 - a) * 100}% -20% ${b * 100}%)`
}

type WordsProps = Pos & {
    text: string
    size: number
    v?: 'stadium' | 'heading' | 'scoreboard' | 'body' | 'bodyBold' | 'mono'
    color?: string
    inAt: number
    outAt?: number
    dur?: number
    /** Slide distance on entry (px). */
    slide?: number
    tracking?: string
    lineHeight?: number
    style?: React.CSSProperties
}

export function Words({ text, size, v = 'stadium', color = C.chalk, inAt, outAt, dur = 9, slide = 40, x, y, align = 'left', tracking, lineHeight = 0.92, style }: WordsProps): React.ReactElement | null {
    const f = useCurrentFrame()
    if (f < inAt) return null
    if (outAt !== undefined && f > outAt + dur) return null
    const a = ease.expoOut(clamp01((f - inAt) / dur))
    const vs = v === 'mono' ? MONO : voice(v)
    return (
        <div
            style={{
                position: 'absolute', left: x, top: y, transform: `translate(${anchor(align)}, -50%) translateX(${(1 - a) * -slide}px)`,
                clipPath: wipe(f, inAt, outAt, dur), padding: '0 0.12em', whiteSpace: 'pre', textAlign: align,
                fontSize: size, color, lineHeight, letterSpacing: tracking, ...vs, ...style,
            }}
        >
            {text}
        </div>
    )
}

/** A -10° lime slab with on-lime type: grows from the left, then the words land. */
export function LimeSlab({ text, size, x, y, align = 'left', inAt, outAt, sub }: Pos & { text: string; size: number; inAt: number; outAt?: number; sub?: string }): React.ReactElement | null {
    const f = useCurrentFrame()
    if (f < inAt) return null
    const g = ease.expoOut(clamp01((f - inAt) / 8))
    const tIn = ease.expoOut(clamp01((f - inAt - 3) / 9))
    const out = outAt === undefined ? 0 : ease.expoIn(clamp01((f - outAt) / 7))
    if (out >= 1) return null
    return (
        <div style={{ position: 'absolute', left: x, top: y, transform: `translate(${anchor(align)}, -50%)` }}>
            <div
                style={{
                    position: 'relative', padding: `${size * 0.16}px ${size * 0.42}px ${size * 0.14}px`, transform: 'skewX(-10deg)',
                    clipPath: `inset(0 ${(1 - g) * 100}% 0 ${out * 100}%)`, background: C.lime,
                }}
            >
                <div style={{ transform: `skewX(10deg) translateX(${(1 - tIn) * -size * 0.4}px)`, opacity: tIn, ...voice('heading'), fontSize: size, lineHeight: 1, color: C.onLime, whiteSpace: 'pre' }}>
                    {sub && <span style={{ ...MONO, fontSize: size * 0.42, marginRight: size * 0.3, verticalAlign: '0.32em', fontStyle: 'normal' }}>{sub}</span>}
                    {text}
                </div>
            </div>
        </div>
    )
}

/** A chalk bar drawn across a block of text from the left. */
export function Strike({ x, y, w, h, at, color = C.chalk }: { x: number; y: number; w: number; h: number; at: number; color?: string }): React.ReactElement | null {
    const f = useCurrentFrame()
    if (f < at) return null
    const a = ease.expoOut(clamp01((f - at) / 7))
    return <div style={{ position: 'absolute', left: x, top: y - h / 2, width: w * a, height: h, background: color, transform: 'skewY(-4deg)', transformOrigin: 'left center' }} />
}
