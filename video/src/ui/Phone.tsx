// A flat phone mock and a generic group chat in brand colours ("Thursday 5s"). No messenger branding.
import { useCurrentFrame } from 'remotion'
import { C, FONT, MONO, clamp01, ease, lerp, voice } from '../brand'

export const PHONE = { w: 440, h: 900 } as const

export function Phone({ x, y, scale = 1, rot = 0, children }: { x: number; y: number; scale?: number; rot?: number; children: React.ReactNode }): React.ReactElement {
    return (
        <div style={{ position: 'absolute', left: x, top: y, width: PHONE.w, height: PHONE.h, transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})` }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 64, background: '#050706', boxShadow: `0 0 0 2px ${C.line}, 0 60px 120px rgba(0,0,0,0.6)` }} />
            <div style={{ position: 'absolute', inset: 14, borderRadius: 52, overflow: 'hidden', background: C.ground }}>
                {children}
                <div style={{ position: 'absolute', top: 14, left: '50%', width: 120, height: 34, marginLeft: -60, borderRadius: 20, background: '#050706' }} />
            </div>
        </div>
    )
}

export type Msg = {
    at: number
    from: string
    text?: string
    me?: boolean
    reel?: React.ReactNode
    /** Estimated rendered height (px). */
    h: number
    reactions?: { emoji: string; at: number }[]
}

const SENDER: Record<string, string> = {}

function Bubble({ m, f }: { m: Msg; f: number }): React.ReactElement {
    const a = ease.backOut(clamp01((f - m.at) / 9))
    const o = clamp01((f - m.at) / 4)
    return (
        <div style={{ display: 'flex', justifyContent: m.me ? 'flex-end' : 'flex-start', padding: '0 18px', marginBottom: 14, opacity: o, transform: `translateY(${(1 - a) * 24}px) scale(${lerp(0.92, 1, a)})`, transformOrigin: m.me ? 'right bottom' : 'left bottom' }}>
            <div style={{ position: 'relative', maxWidth: 320, background: m.me ? C.surface2 : C.surface, border: `1px solid ${C.line}`, borderRadius: 20, borderBottomLeftRadius: m.me ? 20 : 6, borderBottomRightRadius: m.me ? 6 : 20, padding: m.reel ? 6 : '10px 14px 11px' }}>
                {!m.me && !m.reel && <div style={{ fontFamily: FONT.archivo, fontWeight: 700, fontSize: 15, color: SENDER[m.from] ?? C.muted, marginBottom: 3 }}>{m.from}</div>}
                {m.reel}
                {m.text && <div style={{ fontFamily: FONT.archivo, fontWeight: 500, fontSize: 21, lineHeight: 1.25, color: C.chalk, padding: m.reel ? '8px 8px 4px' : 0 }}>{m.text}</div>}
                {m.reactions && m.reactions.some((r) => f >= r.at) && (
                    <div style={{ position: 'absolute', bottom: -22, [m.me ? 'right' : 'left']: 12, display: 'flex', gap: 2, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 16, padding: '2px 8px' }}>
                        {m.reactions.filter((r) => f >= r.at).map((r, i) => {
                            const p = ease.backOut(clamp01((f - r.at) / 8))
                            return <span key={i} style={{ fontSize: 22, display: 'inline-block', transform: `scale(${p})` }}>{r.emoji}</span>
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export function Chat({ title = 'Thursday 5s', members = 'Sam L, A Lo, Jak, Ryan, Joe, you', messages, typing }: { title?: string; members?: string; messages: Msg[]; typing?: { from: string; at: number; until: number } }): React.ReactElement {
    const f = useCurrentFrame()
    const shown = messages.filter((m) => f >= m.at)
    // Scroll: the newest message sits at the bottom; earlier ones slide up as each arrives.
    const offset = shown.reduce((s, m) => s + m.h * ease.expoOut(clamp01((f - m.at) / 8)), 0)
    const isTyping = typing && f >= typing.at && f < typing.until
    return (
        <div style={{ position: 'absolute', inset: 0, background: C.ground }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 96, top: 128, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(100% - ${offset}px)` }}>
                    {shown.map((m, i) => <div key={i} style={{ height: m.h }}><Bubble m={m} f={f} /></div>)}
                </div>
            </div>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 128, background: C.surface, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'flex-end', padding: '0 22px 16px', gap: 14 }}>
                <div style={{ display: 'flex' }}>
                    {['S', 'A', 'J'].map((l, i) => (
                        <div key={l} style={{ width: 44, height: 44, borderRadius: 22, marginLeft: i ? -14 : 0, background: [C.surface2, C.line, '#2a3830'][i], border: `2px solid ${C.surface}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...voice('scoreboard'), fontSize: 20, color: C.chalk }}>{l}</div>
                    ))}
                </div>
                <div>
                    <div style={{ fontFamily: FONT.archivo, fontWeight: 800, fontSize: 24, color: C.chalk }}>{title}</div>
                    <div style={{ fontFamily: FONT.archivo, fontWeight: 500, fontSize: 15, color: C.muted, marginTop: 2 }}>{isTyping ? `${typing.from} is typing…` : members}</div>
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 96, background: C.surface, borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 18px 18px', gap: 12 }}>
                <div style={{ flex: 1, height: 46, borderRadius: 23, background: C.ground, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 18px', ...MONO, fontWeight: 400, fontSize: 17, color: C.muted }}>Message</div>
            </div>
        </div>
    )
}

/** A video message thumbnail: the reel poster, a duration chip and a play roundel. */
export function ReelThumb({ children, duration = '0:48', w = 300 }: { children: React.ReactNode; duration?: string; w?: number }): React.ReactElement {
    const h = (w * 9) / 16
    return (
        <div style={{ position: 'relative', width: w, height: h, borderRadius: 14, overflow: 'hidden', background: C.surface2 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${w / 1920})`, transformOrigin: '0 0' }}>{children}</div>
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 56, height: 56, marginLeft: -28, marginTop: -28, borderRadius: 28, background: 'rgba(11,15,13,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 0, height: 0, borderLeft: `18px solid ${C.chalk}`, borderTop: '11px solid transparent', borderBottom: '11px solid transparent', marginLeft: 5 }} />
            </div>
            <div style={{ position: 'absolute', right: 8, bottom: 8, ...MONO, fontSize: 14, color: C.chalk, background: 'rgba(11,15,13,0.72)', borderRadius: 6, padding: '2px 6px' }}>{duration}</div>
        </div>
    )
}
