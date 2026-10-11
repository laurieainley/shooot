// Pieces shared by the teaser and the full demo.
import { AbsoluteFill, Html5Audio, Sequence, useCurrentFrame } from 'remotion'
import { C, clamp01, ease, lerp, voice } from '../brand'
import { asset, type Media, type Moment } from '../data/assets'
import { ShoootGfx, type Gfx } from '../graphics/ShoootGfx'
import { integrate } from '../time'
import { FreezeOutline } from '../ui/Chrome'
import { Footage, type Zoom } from '../ui/Footage'

export const has = (m: Media, p: string | undefined): boolean => !!p && !!m.has[p]

/** Plays a moment so its key frame lands at local frame `hitAt`, then freezes there with the lime outline. */
export function MomentFreeze({ media, m, hitAt, zoom, label, children }: { media: Media; m: Moment; hitAt: number; zoom?: (f: number) => Zoom; label: string; children?: React.ReactNode }): React.ReactElement {
    const timeAt = (f: number): number => m.ballInNetSec + (Math.min(f, hitAt) - hitAt) / 30
    return (
        <AbsoluteFill>
            <FreezeOutline at={hitAt}>
                <Footage file={m.file} available={has(media, m.file)} timeAt={timeAt} zoom={zoom} label={label} />
            </FreezeOutline>
            {children}
        </AbsoluteFill>
    )
}

/** A broadcast shot: footage at 1× from `startSec` with the product's graphics on top. */
export function ReelShot({ media, m, startSec, gfx, zoom, use4k, rate, dim = 0, label }: {
    media: Media; m: Moment; startSec: number; gfx?: (f: number) => Gfx[]; zoom?: (f: number) => Zoom; use4k?: boolean; rate?: (i: number) => number; dim?: number; label: string
}): React.ReactElement {
    const f = useCurrentFrame()
    const file = use4k && has(media, m.file4k) ? m.file4k! : m.file
    const slow = !!rate
    return (
        <AbsoluteFill>
            <Footage file={file} available={has(media, file)} blend={slow} timeAt={(x) => startSec + (rate ? integrate(x, rate) : x / 30)} zoom={zoom} dim={dim} label={label} />
            {gfx && <ShoootGfx items={gfx(f)} />}
        </AbsoluteFill>
    )
}

/** One-shot sound effect at a local frame. */
export function Sfx({ name, at, volume = 1, durFrames = 150 }: { name: string; at: number; volume?: number; durFrames?: number }): React.ReactElement {
    return (
        <Sequence from={Math.max(0, Math.round(at))} durationInFrames={durFrames}>
            <Html5Audio src={asset(`audio/sfx-${name}.mp3`)} volume={volume} />
        </Sequence>
    )
}

/** Burned-in VO caption: Archivo 700, chalk on a soft scrim, lower centre, at most two lines. */
export function VoCaption({ text, dur, align = 'center' }: { text: string; dur: number; align?: 'center' | 'left' }): React.ReactElement | null {
    const f = useCurrentFrame()
    const a = ease.out(clamp01(f / 6))
    const out = ease.out(clamp01((f - dur) / 6))
    if (out >= 1) return null
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260, background: 'linear-gradient(0deg, rgba(11,15,13,0.72) 0%, rgba(11,15,13,0.35) 55%, rgba(11,15,13,0) 100%)', opacity: a * (1 - out) }} />
            <div style={{ position: 'absolute', left: align === 'center' ? '50%' : 110, bottom: 74, transform: `translate(${align === 'center' ? '-50%' : '0'}, ${lerp(10, 0, a)}px)`, width: align === 'center' ? 1240 : 820, textAlign: align, opacity: a * (1 - out), ...voice('bodyBold'), fontSize: 46, lineHeight: 1.22, color: C.chalk, textShadow: '0 2px 12px rgba(0,0,0,0.5)', textWrap: 'balance' as React.CSSProperties['textWrap'] }}>
                {text}
            </div>
        </AbsoluteFill>
    )
}
