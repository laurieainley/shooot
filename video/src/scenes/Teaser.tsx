// Teaser: 18 s silent loop (storyboard A). Meaning is carried by type and motion. The first and last frames match:
// Night Turf, the REC badge top-left, the dot blinking on a 30-frame cycle that divides the loop.
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import { C, clamp01, ease, lerp } from '../brand'
import type { Media } from '../data/assets'
import { ShoootGfx, bug, goalCaption } from '../graphics/ShoootGfx'
import { MOTIF, Motif } from '../motif/Motif'
import { WhipCut, WHIP_FRAMES } from '../motif/Whip'
import { shoutOffsets, toScreen, unitScale, DOT } from '../motif/Wordmark'
import { integrate, frameAt } from '../time'
import { CaptureClip } from '../ui/CaptureClip'
import { Brackets, REC_POS, RecBadge, FreezeOutline, recOn } from '../ui/Chrome'
import { Footage } from '../ui/Footage'
import { Ground, PitchLines } from '../ui/Ground'
import { Chat, Phone, ReelThumb, type Msg } from '../ui/Phone'
import { LimeSlab, Strike, Words } from '../ui/Type'

export const TEASER_FRAMES = 540

const T = {
    s1: 45,
    s2: 120,
    s3: 215,
    whip: 296,
    s4: 355,
    s5: 426,
} as const

export type TeaserProps = { media: Media }

const has = (m: Media, p: string): boolean => !!m.has[p]

/** 0 · Thursday, 8pm: the hall, the camera's REC badge. */
function Hall({ media }: TeaserProps): React.ReactElement {
    const f = useCurrentFrame()
    const k = media.moments.kickoff
    const fadeIn = ease.out(clamp01(f / 10))
    return (
        <Ground>
            <AbsoluteFill style={{ opacity: fadeIn }}>
                <Footage file={k.file} available={has(media, k.file)} timeAt={(x) => 1.0 + x / 30} zoom={(x) => ({ scale: lerp(1.0, 1.06, ease.out(x / 60)), cx: 0.5, cy: 0.5 })} dim={0.3} label="kickoff" />
            </AbsoluteFill>
            <Words text="THURSDAY. 8PM." v="mono" size={34} tracking="0.3em" x={96} y={968} inAt={8} />
        </Ground>
    )
}

/** 1 · The worldie: ramp into the net, freeze with the lime outline, then the punchline. */
function Worldie({ media }: TeaserProps): React.ReactElement {
    const m = media.moments.sam
    const rate = (i: number): number => (i < 8 ? 1 : lerp(1, 0.3, ease.out(clamp01((i - 8) / 10))))
    const start = m.ballInNetSec - 0.55
    const freeze = Math.round(frameAt(m.ballInNetSec - start, rate))
    const timeAt = (f: number): number => start + Math.min(integrate(f, rate), m.ballInNetSec - start)
    return (
        <AbsoluteFill>
            <FreezeOutline at={freeze}>
                <Footage file={m.file} available={has(media, m.file)} timeAt={timeAt} zoom={(f) => ({ scale: lerp(1.05, 1.18, ease.out(clamp01(f / freeze))), cx: 0.72, cy: 0.62 })} label="sam goal" />
            </FreezeOutline>
            <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(11,15,13,0.72) 0%, rgba(11,15,13,0.0) 60%)', opacity: clamp01((useCurrentFrame() - freeze) / 6) }} />
            <Words text="WORLDIE." size={168} x={150} y={440} inAt={freeze + 2} />
            <Strike x={140} y={446} w={1010} h={16} at={freeze + 19} />
            <Words text="NOBODY SAW IT." v="heading" size={104} x={154} y={612} inAt={freeze + 23} />
        </AbsoluteFill>
    )
}

/** 2 · Tag it: the real editor; G → Goal → Whites → Sam L. */
function TagIt({ media }: TeaserProps): React.ReactElement {
    const f = useCurrentFrame()
    const cap = media.captures['b-tagging-2x'] ?? media.captures['b-tagging']
    const enter = ease.expoOut(clamp01(f / 14))
    const g = cap?.events.find((e) => e.key === 'G')?.t ?? 5.32
    const src0 = g - 0.47
    const rate = 1.2
    const timeAt = (x: number): number => src0 + (x / 30) * rate
    const zoomP = ease.quintInOut(clamp01((timeAt(f) - g - 0.1) / 0.5))
    return (
        <Ground pitch={0.5}>
            <CaptureClip
                cap={cap}
                label="b-tagging"
                timeAt={timeAt}
                zoom={() => ({ scale: lerp(1, 1.7, zoomP), cx: 0.0, cy: 0.98 })}
                frame={{ width: 1440, x: lerp(1500, 1020, enter), y: 520, rx: 4, ry: lerp(-26, -9, enter) }}
                keyPos={{ x: 1700, y: 900 }}
            />
            <LimeSlab text="TAG IT." size={92} x={96} y={930} inAt={8} />
        </Ground>
    )
}

/** 3 · On telly: the goal with the real scorebug + caption, then a ball-wipe into the zoomed slow-mo replay. */
function Telly({ media }: TeaserProps): React.ReactElement {
    const f = useCurrentFrame()
    const m = media.moments.sam
    const pre = 1.5
    const netF = Math.round(pre * 30)
    const live = (
        <AbsoluteFill>
            <Footage file={m.file} available={has(media, m.file)} timeAt={(x) => m.ballInNetSec - pre + x / 30} label="sam goal" />
            <ShoootGfx
                items={
                    f < netF + 12
                        ? [{ kind: 'bug', bug: bug(3, 1), t: 1, duration: 10, fade: false }]
                        : [{ kind: 'caption', spec: goalCaption('SAM L', "'13", [4, 1], { assist: 'A LO' }), t: (f - netF - 12) / 30 }]
                }
            />
        </AbsoluteFill>
    )
    const whipAt = T.whip - T.s3
    const rf = f - whipAt - Math.round(WHIP_FRAMES / 2)
    const rRate = (i: number): number => lerp(1, 0.5, ease.out(clamp01(i / 10)))
    const rStart = m.ballInNetSec - 1.9
    const file = m.file4k && has(media, m.file4k) ? m.file4k : m.file
    const replay = (
        <AbsoluteFill>
            <Footage
                file={file}
                available={has(media, file)}
                blend
                timeAt={(x) => rStart + integrate(Math.max(0, x - whipAt - 7), rRate)}
                zoom={(x) => ({ scale: lerp(1.25, 1.9, ease.out(clamp01((x - whipAt) / 50))), cx: 0.8, cy: 0.66 })}
                dim={0.18}
                label="sam replay"
            />
            <ShoootGfx items={[{ kind: 'replay', t: Math.max(0, rf / 30), speed: 0.5 }]} />
            <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(11,15,13,0.75) 0%, rgba(11,15,13,0) 40%)' }} />
            <Words text="AS SEEN ON TELLY." size={104} x={96} y={936} inAt={whipAt + 16} />
        </AbsoluteFill>
    )
    return <WhipCut at={whipAt} a={live} b={replay} />
}

/** 4 · Send it: the reel lands in the group chat. */
function SendIt({ media }: TeaserProps): React.ReactElement {
    const f = useCurrentFrame()
    const up = ease.expoOut(clamp01(f / 16))
    const m = media.moments.sam
    const thumb = (
        <ReelThumb duration="0:48">
            <Footage file={m.file} available={has(media, m.file)} timeAt={() => m.ballInNetSec + 0.6} label="poster" />
            <ShoootGfx items={[{ kind: 'caption', spec: goalCaption('SAM L', "'13", [4, 1], { assist: 'A LO' }), t: 1 }]} />
        </ReelThumb>
    )
    const msgs: Msg[] = [
        { at: 0, from: 'Ryan', text: 'anyone get that at the end??', h: 78 },
        { at: 12, from: 'You', me: true, reel: thumb, text: 'Thursday highlights', h: 252, reactions: [{ emoji: '🔥', at: 26 }, { emoji: '⚽', at: 30 }, { emoji: '😂', at: 34 }] },
        { at: 44, from: 'Jak', text: 'NOT THE OWN GOAL 😭', h: 80 },
    ]
    return (
        <Ground pitch={0.6}>
            <Phone x={1390} y={lerp(1600, 590, up)} rot={lerp(8, 3, up)} scale={1.12}>
                <Chat messages={msgs} />
            </Phone>
            <Words text="SEND IT." size={160} x={110} y={540} inAt={6} />
        </Ground>
    )
}

const PLACE = { cx: 960, cy: 470, width: 1100 }
/** Motif frames are offset so the kick lands 14 frames into the scene. */
const MOTIF_OFFSET = MOTIF.kick - 14

/** 5 · The REC dot is kicked into the wordmark; CTA; the full stop goes back to being the REC dot (loop seam). */
function Sign({ startAbs }: { startAbs: number }): React.ReactElement {
    const f = useCurrentFrame()
    const mf = f + MOTIF_OFFSET
    const exitAt = 94
    const exit = ease.expoIn(clamp01((f - exitAt) / 8))
    const k = unitScale(PLACE)
    const off = shoutOffsets(1, 1)
    const stop = toScreen({ x: DOT.x + off.t, y: DOT.y }, PLACE)
    // The full stop flies home to the REC position.
    const home = clamp01((f - (exitAt - 2)) / 16)
    const h = ease.quintInOut(home)
    const dotX = lerp(stop.x, REC_POS.x, h)
    const dotY = lerp(stop.y, REC_POS.y, h) - Math.sin(Math.PI * h) * 90
    const dotR = lerp(DOT.r * k, REC_POS.r, h)
    const absF = startAbs + f
    const settled = mf >= MOTIF.settled
    const arrived = home >= 1
    return (
        <Ground>
            <PitchLines draw={ease.out(clamp01(f / 24))} opacity={1 - exit} />
            <AbsoluteFill style={{ clipPath: `inset(-10% -10% -10% ${exit * 100}%)` }}>
                <Motif placement={PLACE} from={{ x: REC_POS.x, y: REC_POS.y }} fromR={REC_POS.r} frameOffset={MOTIF_OFFSET} hideDotAfter={exitAt - 2 + MOTIF_OFFSET} />
                <LimeSlab text="FREE EARLY ACCESS" size={50} x={960} y={720} align="center" inAt={66} />
                <Words text="shooot.co.uk" v="mono" size={30} color={C.muted} x={960} y={812} align="center" inAt={72} tracking="0.08em" style={{ textTransform: 'none' }} />
            </AbsoluteFill>
            {f < MOTIF.kick - MOTIF_OFFSET && recOn(absF) && (
                <div style={{ position: 'absolute', left: REC_POS.x - REC_POS.r, top: REC_POS.y - REC_POS.r, width: REC_POS.r * 2, height: REC_POS.r * 2, borderRadius: '50%', background: C.rec }} />
            )}
            {settled && f >= exitAt - 2 && (!arrived || recOn(absF)) && (
                <div style={{ position: 'absolute', left: dotX - dotR, top: dotY - dotR, width: dotR * 2, height: dotR * 2, borderRadius: '50%', background: C.rec }} />
            )}
            {f >= exitAt + 4 && <RecBadge absFrame={absF} dot={false} opacity={ease.out(clamp01((f - exitAt - 4) / 8))} />}
            {f < 8 && <RecBadge absFrame={absF} dot={false} opacity={1 - ease.out(clamp01(f / 8))} />}
            {f >= exitAt + 4 && <Brackets opacity={ease.out(clamp01((f - exitAt - 4) / 8))} />}
            {f < 8 && <Brackets opacity={1 - ease.out(clamp01(f / 8))} />}
        </Ground>
    )
}

export function Teaser({ media }: TeaserProps): React.ReactElement {
    const f = useCurrentFrame()
    const camera = f < T.s2 || f >= TEASER_FRAMES
    return (
        <AbsoluteFill style={{ background: C.ground }}>
            <Sequence durationInFrames={T.s1}><Hall media={media} /></Sequence>
            <Sequence from={T.s1} durationInFrames={T.s2 - T.s1}><Worldie media={media} /></Sequence>
            <Sequence from={T.s2} durationInFrames={T.s3 - T.s2}><TagIt media={media} /></Sequence>
            <Sequence from={T.s3} durationInFrames={T.s4 - T.s3}><Telly media={media} /></Sequence>
            <Sequence from={T.s4} durationInFrames={T.s5 - T.s4}><SendIt media={media} /></Sequence>
            <Sequence from={T.s5} durationInFrames={TEASER_FRAMES - T.s5}><Sign startAbs={T.s5} /></Sequence>
            {camera && (
                <>
                    <RecBadge absFrame={f} />
                    <Brackets />
                </>
            )}
        </AbsoluteFill>
    )
}
