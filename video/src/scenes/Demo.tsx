// The full demo (storyboard B), cut to the music's bar grid (see demoPlan.ts). DemoA / DemoB differ only in the track.
import { AbsoluteFill, Html5Audio, Sequence, useCurrentFrame } from 'remotion'
import { C, FONT, MONO, SHIRT, clamp01, ease, lerp, voice } from '../brand'
import { asset, type Media, type Moment } from '../data/assets'
import { FT_CARD, ShoootGfx, TEAMS, VS_CARD, bug, goalCaption, type Gfx } from '../graphics/ShoootGfx'
import type { CaptionSpec } from '../../../src/graphics/types'
import { MOTIF, Motif } from '../motif/Motif'
import { WhipCut, WHIP_FRAMES } from '../motif/Whip'
import { CaptureClip } from '../ui/CaptureClip'
import { Brackets, Cursor, RecBadge, StepLabel } from '../ui/Chrome'
import { Footage } from '../ui/Footage'
import { ExplodingEditor, GagLabel, GoProOnBottle, HourCounter, PhoneInBag } from '../ui/Gags'
import { Ground, PitchLines } from '../ui/Ground'
import { Chat, Phone, ReelThumb, type Msg } from '../ui/Phone'
import { LimeSlab, Words } from '../ui/Type'
import { demoPlan, type DemoPlan } from './demoPlan'
import { MomentFreeze, ReelShot, Sfx, VoCaption, has } from './shared'

export type DemoProps = { media: Media }

type SceneProps = { media: Media; plan: DemoPlan; len: number }

const cap = (o: Partial<CaptionSpec> & Pick<CaptionSpec, 'label'>): CaptionSpec => ({ stripe: TEAMS.left.colour, ...o })
const CAPTIONS = {
    sam: goalCaption('SAM L', "'13", [4, 1], { assist: 'A LO' }),
    ryan: goalCaption('RYAN', "'26", [5, 6], { assist: 'LAURIE', stripe: TEAMS.right.colour }),
    laurie: goalCaption('LAURIE', "'48", [8, 12], { assist: 'SAM L', stripe: TEAMS.right.colour }),
    joe: cap({ label: 'SAVE', tone: 'other', person: 'JOE', minute: "'14", stripe: TEAMS.right.colour, bug: bug(4, 2) }),
    pen: cap({ label: 'PENALTY MISSED', tone: 'other', person: 'A LO', minute: "'20", bug: bug(4, 4) }),
    og: cap({ label: 'OWN GOAL', tone: 'ownGoal', person: 'JAK', minute: "'35", stripe: TEAMS.right.colour, bug: bug(5, 8) }),
}

/** Caption graphics on its own clock, starting at local frame `at`. */
const captionAt = (spec: CaptionSpec, f: number, at: number): Gfx[] => (f >= at ? [{ kind: 'caption', spec, t: (f - at) / 30 }] : [])

// ─── 1 · Hook ────────────────────────────────────────────────────────────────────────────────────────────────

function Hook({ media, len }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const k = media.moments.kickoff
    const s = 20 * 3600 + f / 30
    const clock = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    return (
        <AbsoluteFill style={{ background: C.ground }}>
            <AbsoluteFill style={{ opacity: ease.out(clamp01(f / 12)) }}>
                <Footage file={k.file} available={has(media, k.file)} timeAt={(x) => 4.5 + x / 30} zoom={(x) => ({ scale: lerp(1.0, 1.08, ease.out(x / len)), cx: 0.5, cy: 0.5 })} dim={0.32} label="kickoff" />
            </AbsoluteFill>
            <RecBadge absFrame={f} clock={clock} />
            <Brackets />
            <Words text="THURSDAY 5-A-SIDE" v="mono" size={34} tracking="0.3em" x={96} y={940} inAt={14} />
            <Words text={`WHITES  v  COLOURS`} v="scoreboard" size={64} x={96} y={990} inAt={22} />
        </AbsoluteFill>
    )
}

// ─── 2 · Quick-fire moments ──────────────────────────────────────────────────────────────────────────────────

function NameTag({ name, what, inAt }: { name: string; what: string; inAt: number }): React.ReactElement {
    return (
        <>
            <Words text={name} size={96} v="body" x={110} y={150} inAt={inAt} style={{ ...SHIRT, fontWeight: 800 }} />
            <Words text={what} v="mono" size={26} tracking="0.24em" color={C.lime} x={114} y={222} inAt={inAt + 4} />
        </>
    )
}

function Moments({ media, plan, len }: SceneProps): React.ReactElement {
    const b = Math.round(plan.beat)
    const cuts = [0, 3 * b, 5 * b + Math.round(b / 2), len]
    const shot = (m: Moment, i: number, name: string, what: string, zoom: { cx: number; cy: number; s: number }, label: string): React.ReactElement => {
        const d = cuts[i + 1] - cuts[i]
        const hit = Math.min(d - 14, Math.round(b * 1.4))
        return (
            <Sequence from={cuts[i]} durationInFrames={d}>
                <MomentFreeze media={media} m={m} hitAt={hit} label={label} zoom={(x) => ({ scale: lerp(1.15, zoom.s, ease.out(clamp01(x / hit))), cx: zoom.cx, cy: zoom.cy })}>
                    <NameTag name={name} what={what} inAt={hit + 2} />
                </MomentFreeze>
                <Sfx name={what === 'SAVE' ? 'ball-strike' : 'net-swish'} at={hit - 2} volume={0.7} />
                <Sfx name="shutter" at={hit} volume={0.5} />
            </Sequence>
        )
    }
    return (
        <AbsoluteFill>
            {shot(media.moments.ryan, 0, 'RYAN', 'FINISH', { cx: 0.42, cy: 0.38, s: 1.9 }, 'ryan')}
            {shot(media.moments.joe, 1, 'JOE', 'SAVE', { cx: 0.5, cy: 0.45, s: 1.5 }, 'joe')}
            {shot(media.moments.sam, 2, 'SAM L', 'GOAL', { cx: 0.8, cy: 0.66, s: 1.5 }, 'sam')}
        </AbsoluteFill>
    )
}

// ─── 3 · The problem ────────────────────────────────────────────────────────────────────────────────────────

function Problem(_: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const split = 84
    const out = ease.expoIn(clamp01((f - split + 8) / 8))
    return (
        <Ground pitch={0.35}>
            {f < split && (
                <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${out * 100}%)` }}>
                    <div style={{ position: 'absolute', left: 960, top: 240, bottom: 140, width: 2, background: C.line }} />
                    <PhoneInBag x={520} y={560} s={0.95} appear={(f - 2) / 10} />
                    <GagLabel text="PHONE IN BAG" x={520} y={790} appear={(f - 12) / 10} />
                    <GoProOnBottle x={1400} y={540} s={0.85} appear={(f - 10) / 10} />
                    <GagLabel text="GOPRO ON A BOTTLE" x={1400} y={790} appear={(f - 20) / 10} />
                    <HourCounter x={960} y={150} from={14} dur={66} />
                </AbsoluteFill>
            )}
            {f >= split - 8 && (
                <AbsoluteFill style={{ clipPath: `inset(0 ${(1 - ease.expoOut(clamp01((f - split + 8) / 10))) * 100}% 0 0)` }}>
                    <ExplodingEditor start={split - 8} dialogAt={split + 34} />
                </AbsoluteFill>
            )}
        </Ground>
    )
}

// ─── 4 · The group chat ─────────────────────────────────────────────────────────────────────────────────────

function GroupChat({ plan }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const b = plan.beat
    const up = ease.expoOut(clamp01(f / 14))
    const msgs: Msg[] = [
        { at: Math.round(b * 0.5), from: 'Ryan', text: 'did anyone get that??', h: 78 },
        { at: Math.round(b * 2.5), from: 'Joe', text: 'was it in?', h: 78 },
        { at: Math.round(b * 4.5), from: 'Jak', text: 'ref 🙄', h: 78 },
        { at: Math.round(b * 6.5), from: 'A Lo', text: 'best goal of my life and nobody filmed it', h: 106 },
    ]
    return (
        <Ground pitch={0.35}>
            <Phone x={1340} y={lerp(1500, 580, up)} rot={lerp(-8, -3, up)} scale={1.1}>
                <Chat messages={msgs} typing={{ from: 'Sam L', at: Math.round(b * 8.5), until: 999 }} />
            </Phone>
            <Words text="0" size={330} x={150} y={450} inAt={Math.round(b * 7)} />
            <Words text="REPLAYS." size={110} x={150} y={680} inAt={Math.round(b * 7) + 4} />
            {msgs.map((m, i) => <Sfx key={i} name="ui-tick" at={m.at} volume={0.5} />)}
            <Sfx name="crowd-ooh" at={Math.round(b * 7)} volume={0.25} />
        </Ground>
    )
}

// ─── 5 · Why it matters ─────────────────────────────────────────────────────────────────────────────────────

function Why({ media, plan, len }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const bar = Math.round(plan.bar)
    const pen = (m: Moment, from: number, label: string): React.ReactElement => {
        const lead = 34
        return (
            <Sequence from={from} durationInFrames={bar}>
                <ReelShot media={media} m={m} startSec={m.ballInNetSec - lead / 30} label={label} zoom={() => ({ scale: 1.35, cx: 0.7, cy: 0.6 })} gfx={(x) => captionAt(CAPTIONS.pen, x, lead - 4)} />
                <Sfx name="crowd-ooh" at={lead - 4} volume={0.8} />
            </Sequence>
        )
    }
    const og = media.moments.jak
    const ogFrom = 2 * bar
    const ogLive = 36
    const whipAt = ogFrom + ogLive
    const live = (
        <ReelShot media={media} m={og} startSec={og.ballInNetSec - 1.0} label="jak og" zoom={(x) => ({ scale: lerp(1.5, 1.8, ease.out(clamp01(x / 40))), cx: 0.22, cy: 0.3 })} />
    )
    const rate = (i: number): number => lerp(1, 0.5, ease.out(clamp01(i / 8)))
    const replay = (
        <AbsoluteFill>
            <ReelShot
                media={media}
                m={og}
                startSec={og.ballInNetSec - 1.6}
                rate={(i) => rate(Math.max(0, i - 7))}
                label="jak og replay"
                zoom={(x) => ({ scale: lerp(2.2, 2.6, ease.out(clamp01(x / 60))), cx: 0.22, cy: 0.3 })}
                gfx={(x) => [{ kind: 'replay', t: x / 30, speed: 0.5 }, ...captionAt(CAPTIONS.og, x, 10)]}
                dim={0.15}
            />
        </AbsoluteFill>
    )
    return (
        <AbsoluteFill style={{ background: C.ground }}>
            {pen(media.moments.pen1, 0, 'pen miss 1')}
            {pen(media.moments.pen2, bar, 'pen miss 2')}
            <Sequence from={ogFrom}>
                <WhipCut at={ogLive} a={live} b={<Sequence from={ogLive + 7}>{replay}</Sequence>} />
                <Sfx name="whoosh" at={ogLive - 2} volume={0.6} />
            </Sequence>
            {f >= ogFrom && (
                <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(11,15,13,0.0) 0%, rgba(11,15,13,0) 50%)' }}>
                    <Words text="EVERY GOAL DESERVES" size={86} x={960} y={720} align="center" inAt={ogFrom + 4} outAt={len - 10} />
                    <Words text="A REPLAY." size={86} x={960} y={810} align="center" inAt={ogFrom + 8} outAt={len - 10} />
                </AbsoluteFill>
            )}
            {f >= whipAt + WHIP_FRAMES && <LimeSlab text="EVEN THAT ONE." size={64} x={1824} y={240} align="right" inAt={whipAt + WHIP_FRAMES + 12} outAt={len - 8} />}
        </AbsoluteFill>
    )
}

// ─── 6 · Reveal ─────────────────────────────────────────────────────────────────────────────────────────────

const PLACE = { cx: 960, cy: 470, width: 1100 }

function Reveal({ len }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const out = ease.expoIn(clamp01((f - len + 8) / 8))
    return (
        <Ground>
            <PitchLines draw={ease.out(clamp01(f / 40))} />
            <AbsoluteFill style={{ clipPath: `inset(-10% -10% -10% ${out * 100}%)` }}>
                <Motif placement={PLACE} from={{ x: 470, y: 780 }} fromR={22} blink />
                <Words text="Your five-a-side, as seen on telly." v="bodyBold" size={58} x={960} y={720} align="center" inAt={MOTIF.settled - 4} style={{ textTransform: 'none' }} />
            </AbsoluteFill>
            <Sfx name="rec-beep" at={2} volume={0.6} />
            <Sfx name="ball-strike" at={MOTIF.kick - 1} volume={0.9} />
            <Sfx name="net-swish" at={MOTIF.impact - 1} volume={0.9} />
            <Sfx name="crowd-roar" at={MOTIF.impact} volume={0.35} />
        </Ground>
    )
}

// ─── 7 · Film it ────────────────────────────────────────────────────────────────────────────────────────────

const FRAME = { width: 1400, x: 1060, y: 560, rx: 4, ry: -9 }

function frameIn(f: number, from = 0): typeof FRAME {
    const e = ease.expoOut(clamp01((f - from) / 16))
    return { ...FRAME, x: lerp(1700, FRAME.x, e), ry: lerp(-28, FRAME.ry, e) }
}

function FilmIt({ media, len }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const flyAt = 40
    const ill = 1 - ease.expoIn(clamp01((f - flyAt) / 10))
    return (
        <Ground pitch={0.4}>
            {ill > 0 && (
                <AbsoluteFill style={{ opacity: ill }}>
                    <GoProOnBottle x={600} y={540} s={0.9} appear={(f - 2) / 10} />
                    <Words text="GoPro, phone," v="heading" size={84} x={900} y={470} inAt={6} style={{ textTransform: 'none' }} />
                    <Words text="whatever you've got." v="heading" size={84} x={900} y={570} inAt={12} style={{ textTransform: 'none' }} />
                </AbsoluteFill>
            )}
            {f >= flyAt && (
                <CaptureClip cap={media.captures['a-drop-files']} label="a-drop-files" timeAt={(x) => 2.1 + Math.max(0, x - flyAt) / 30 * 1.6} frame={frameIn(f, flyAt)} />
            )}
            <StepLabel n="01" text="FILM IT" inAt={2} outAt={len - 6} />
        </Ground>
    )
}

// ─── 8 · Tag it ─────────────────────────────────────────────────────────────────────────────────────────────

function TagIt({ media, plan, len }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const two = media.captures['b-tagging-2x']
    const tagCap = two ?? media.captures['b-tagging']
    const tagLen = Math.round(plan.bar * 3)
    // Tagging at 1.15×: G → Goal → Whites → Sam L → assist A Lo.
    const t0 = 4.5
    const tAt = (x: number): number => t0 + (x / 30) * 1.15
    const g = (tagCap?.events.find((e) => e.key === 'G')?.t ?? 5.3)
    const zoomP = ease.quintInOut(clamp01((tAt(f) - g - 0.15) / 0.5)) * (1 - ease.quintInOut(clamp01((f - tagLen + 18) / 14)))
    const scrubFrom = tagLen
    const scrub = media.captures['c-scrub-montage']
    const ff = f - scrubFrom
    return (
        <Ground pitch={0.4}>
            {f < scrubFrom ? (
                <CaptureClip cap={tagCap} label="b-tagging" timeAt={tAt} frame={FRAME} keyPos={{ x: 1700, y: 900 }} zoom={() => ({ scale: lerp(1, 1.75, zoomP), cx: 0.0, cy: 0.98 })} />
            ) : (
                <>
                    <CaptureClip cap={scrub} label="c-scrub-montage" timeAt={(x) => 1.4 + Math.max(0, x - scrubFrom) / 30 * 3.2} frame={FRAME} zoom={() => ({ scale: 1.0, cx: 0.5, cy: 0.5 })} />
                    <div style={{ position: 'absolute', right: 96, top: 92, ...MONO, fontSize: 30, color: C.chalk, display: 'flex', gap: 14, alignItems: 'center', opacity: ease.out(clamp01(ff / 6)) }}>
                        <span style={{ letterSpacing: '-0.1em' }}>▶▶</span> 3×
                    </div>
                    <div style={{ position: 'absolute', left: 96, top: 945, ...MONO, fontSize: 40, letterSpacing: '0.12em', color: C.chalk, opacity: ease.out(clamp01(ff / 6)) }}>{Math.min(28, Math.round(lerp(6, 28, clamp01(ff / (len - scrubFrom - 8)))))} TAGS</div>
                </>
            )}
            <StepLabel n="02" text="TAG IT" inAt={2} outAt={len - 6} />
            {(tagCap?.events ?? []).filter((e) => e.type === 'key' && e.key !== 'Space' && e.key !== 'Esc').map((e, i) => (
                <Sfx key={i} name="ui-tick" at={Math.round(((e.t - t0) / 1.15) * 30)} volume={0.6} />
            ))}
        </Ground>
    )
}

// ─── 9 · Match setup ────────────────────────────────────────────────────────────────────────────────────────

function Setup({ media, len }: SceneProps): React.ReactElement {
    const setup = media.captures['d-setup']
    return (
        <Ground pitch={0.4}>
            <CaptureClip cap={setup} label="d-setup" timeAt={(x) => 3.0 + (x / 30) * 2.4} frame={FRAME} zoom={(x) => ({ scale: lerp(1.25, 1.55, ease.out(clamp01(x / 60))), cx: 0.5, cy: 0.4 })} />
            <Words text="TEAMS · KITS · GOAL AREAS" v="mono" size={30} tracking="0.2em" x={96} y={968} inAt={6} outAt={len - 8} />
            <StepLabel n="02" text="TAG IT" inAt={-20} outAt={len - 6} />
        </Ground>
    )
}

// ─── 10 · Render → the reel ─────────────────────────────────────────────────────────────────────────────────

function RenderReel({ media, plan, len }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const exp = media.captures['e-export-render']
    const capLen = Math.round(plan.bar * 2)
    const b2 = Math.round(plan.beat * 2)
    const sam = media.moments.sam
    const outs = [capLen, capLen + b2, capLen + 2 * b2, capLen + 3 * b2, len]
    const rRate = (i: number): number => lerp(1, 0.5, ease.out(clamp01(i / 6)))
    return (
        <Ground pitch={0.4}>
            {f < capLen && (
                <>
                    <CaptureClip cap={exp} label="e-export-render" timeAt={(x) => 1.4 + (x / 30) * 2.4} frame={FRAME} />
                    <StepLabel n="03" text="SEND IT" inAt={2} outAt={capLen - 6} />
                </>
            )}
            <Sequence from={outs[0]} durationInFrames={outs[1] - outs[0]}>
                <ShoootGfx items={[{ kind: 'card', spec: VS_CARD, t: 1.0 + 0 }]} />
            </Sequence>
            <Sequence from={outs[1]} durationInFrames={outs[2] - outs[1]}>
                <ReelShot media={media} m={sam} startSec={sam.ballInNetSec - 0.3} label="sam" gfx={(x) => captionAt(CAPTIONS.sam, x, 0).map((g) => ({ ...g, t: 0.4 + x / 30 }) as Gfx)} />
            </Sequence>
            <Sequence from={outs[2]} durationInFrames={outs[3] - outs[2]}>
                <ReelShot media={media} m={sam} use4k startSec={sam.ballInNetSec - 0.9} rate={rRate} label="sam replay" zoom={(x) => ({ scale: lerp(1.7, 2.0, x / 30), cx: 0.82, cy: 0.66 })} gfx={(x) => [{ kind: 'replay', t: x / 30, speed: 0.5 }]} />
            </Sequence>
            <Sequence from={outs[3]} durationInFrames={outs[4] - outs[3]}>
                <ShoootGfx items={[{ kind: 'card', spec: FT_CARD, t: 1.0 }]} />
            </Sequence>
            <Sfx name="whistle-short" at={outs[0]} volume={0.5} />
            <Sfx name="crowd-roar" at={outs[1]} volume={0.4} />
            <Sfx name="whistle-final" at={outs[3]} volume={0.35} />
        </Ground>
    )
}

// ─── 11 · Full match + YouTube ──────────────────────────────────────────────────────────────────────────────

const CHAPTERS = [
    '00:00 Goal 1-0 (Whites) DJ, assist Sam L',
    '00:44 Goal 1-1 (Colours) Ryan, assist Laurie',
    '01:09 Goal 2-1 (Whites) Jak',
    '01:34 Goal 3-1 (Whites) Jak, assist DJ',
    '01:59 Goal 4-1 (Whites) Sam L, assist A Lo',
    '02:24 Goal 4-2 (Colours) Laurie, assist Joe',
    '03:04 Goal 4-3 (Colours) James, assist Joe',
    '04:24 Penalty missed (Whites) A Lo',
    '04:39 Penalty missed (Whites) A Lo',
    '06:34 Own goal 5-8 (Colours) Jak',
]

function FullMatch({ media, len }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const fm = media.captures['f-fullmatch-description']
    const typeFrom = 40
    const chars = Math.max(0, (f - typeFrom) * 9)
    let left = chars
    const card = ease.expoOut(clamp01((f - typeFrom + 10) / 14))
    return (
        <Ground pitch={0.4}>
            <CaptureClip cap={fm} label="f-fullmatch" timeAt={(x) => 1.2 + (x / 30) * 2.1} frame={{ width: 1180, x: 720, y: 540, rx: 4, ry: 10 }} />
            <div style={{ position: 'absolute', left: 1360, top: 250, width: 500, padding: '26px 30px', borderRadius: 16, background: C.surface, border: `1px solid ${C.line}`, boxShadow: '0 40px 80px rgba(0,0,0,0.55)', transform: `translateX(${(1 - card) * 140}px)`, opacity: card }}>
                <div style={{ ...MONO, fontSize: 18, color: C.muted, letterSpacing: '0.16em', marginBottom: 16 }}>YOUTUBE DESCRIPTION · COPIED</div>
                <div style={{ fontFamily: FONT.archivo, fontWeight: 800, fontSize: 26, color: C.chalk, marginBottom: 14 }}>Whites 8–12 Colours</div>
                {CHAPTERS.map((line, i) => {
                    const n = Math.min(line.length, left)
                    left -= line.length
                    if (n <= 0) return null
                    const [ts, ...rest] = line.slice(0, n).split(' ')
                    return (
                        <div key={i} style={{ ...MONO, fontWeight: 400, fontSize: 17, lineHeight: 1.75, color: C.chalk, whiteSpace: 'nowrap' }}>
                            <span style={{ color: C.lime }}>{ts}</span> {rest.join(' ')}
                        </div>
                    )
                })}
            </div>
            <StepLabel n="03" text="SEND IT" inAt={-20} outAt={len - 6} />
            <Words text="FULL MATCH + CHAPTERS" v="mono" size={30} tracking="0.2em" x={96} y={968} inAt={6} outAt={len - 8} />
        </Ground>
    )
}

// ─── 12 · Send it ───────────────────────────────────────────────────────────────────────────────────────────

function SendIt({ media, plan }: SceneProps): React.ReactElement {
    const f = useCurrentFrame()
    const b = plan.beat
    const up = ease.expoOut(clamp01(f / 16))
    const sam = media.moments.sam
    const thumb = (
        <ReelThumb duration="2:14">
            <Footage file={sam.file} available={has(media, sam.file)} timeAt={() => sam.ballInNetSec + 0.6} label="poster" />
            <ShoootGfx items={[{ kind: 'caption', spec: CAPTIONS.sam, t: 1 }]} />
        </ReelThumb>
    )
    const msgs: Msg[] = [
        { at: Math.round(b), from: 'You', me: true, reel: thumb, text: 'Thursday highlights 🎬', h: 252, reactions: [{ emoji: '🔥', at: Math.round(b * 2.5) }, { emoji: '😂', at: Math.round(b * 3) }, { emoji: '⚽', at: Math.round(b * 3.5) }] },
        { at: Math.round(b * 4), from: 'Jak', text: 'NOT THE OWN GOAL 😭', h: 80 },
        { at: Math.round(b * 5.5), from: 'A Lo', text: 'we going again on the pens?', h: 80 },
    ]
    return (
        <Ground pitch={0.35}>
            <Phone x={1360} y={lerp(1600, 580, up)} rot={lerp(8, 3, up)} scale={1.12}>
                <Chat messages={msgs} />
            </Phone>
            <Words text="Group chat won't" v="heading" size={88} x={110} y={430} inAt={Math.round(b * 2)} style={{ textTransform: 'none' }} />
            <Words text="know what's hit it." v="heading" size={88} x={110} y={530} inAt={Math.round(b * 2) + 4} style={{ textTransform: 'none' }} />
            {msgs.map((m, i) => <Sfx key={i} name="ui-tick" at={m.at} volume={0.5} />)}
        </Ground>
    )
}

// ─── 13 · Montage ───────────────────────────────────────────────────────────────────────────────────────────

function Montage({ media, plan, len }: SceneProps): React.ReactElement {
    const b = Math.round(plan.beat)
    const cuts = [0, 3 * b, 6 * b, 8 * b, len]
    const { ryan, sam, joe, laurie } = media.moments
    const rRate = (i: number): number => lerp(1, 0.5, ease.out(clamp01(i / 6)))
    return (
        <AbsoluteFill style={{ background: C.ground }}>
            <Sequence from={cuts[0]} durationInFrames={cuts[1] - cuts[0]}>
                <ReelShot media={media} m={ryan} use4k startSec={ryan.ballInNetSec - 1.0} label="ryan" zoom={(x) => ({ scale: lerp(1.8, 2.1, x / 80), cx: 0.22, cy: 0.3 })} gfx={(x) => captionAt(CAPTIONS.ryan, x, 14)} />
                <Sfx name="crowd-roar" at={20} volume={0.35} />
            </Sequence>
            <Sequence from={cuts[1]} durationInFrames={cuts[2] - cuts[1]}>
                <ReelShot media={media} m={sam} use4k startSec={sam.ballInNetSec - 1.2} rate={rRate} label="sam replay" zoom={(x) => ({ scale: lerp(1.6, 2.1, x / 45), cx: 0.82, cy: 0.66 })} gfx={(x) => [{ kind: 'replay', t: x / 30, speed: 0.5 }]} />
            </Sequence>
            <Sequence from={cuts[2]} durationInFrames={cuts[3] - cuts[2]}>
                <ReelShot media={media} m={joe} startSec={joe.ballInNetSec - 0.4} label="joe" zoom={() => ({ scale: 1.3, cx: 0.5, cy: 0.45 })} gfx={(x) => captionAt(CAPTIONS.joe, x, 2).map((g) => ({ ...g, t: 0.4 + x / 30 }) as Gfx)} />
            </Sequence>
            <Sequence from={cuts[3]} durationInFrames={cuts[4] - cuts[3]}>
                <ReelShot media={media} m={laurie} use4k startSec={laurie.ballInNetSec - 0.6} label="laurie" zoom={(x) => ({ scale: lerp(2.0, 2.3, x / 50), cx: 0.22, cy: 0.3 })} gfx={(x) => captionAt(CAPTIONS.laurie, x, 10)} />
                <Sfx name="crowd-roar" at={10} volume={0.4} />
            </Sequence>
        </AbsoluteFill>
    )
}

// ─── 14 · End card ──────────────────────────────────────────────────────────────────────────────────────────

function EndCard({ plan, len, motifAt }: SceneProps & { motifAt: number }): React.ReactElement {
    const f = useCurrentFrame()
    const slow = 1.15
    const settled = motifAt + MOTIF.settled * slow
    const ftOut = ease.expoIn(clamp01((f - motifAt + 2) / 8))
    return (
        <AbsoluteFill style={{ background: C.ground }}>
            {f < motifAt + 8 && (
                <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${ftOut * 100}%)` }}>
                    <ShoootGfx items={[{ kind: 'card', spec: FT_CARD, t: 1.5 + f / 30, duration: 60 }]} />
                </AbsoluteFill>
            )}
            {f >= motifAt - 6 && (
                <Ground>
                    <PitchLines draw={ease.out(clamp01((f - motifAt) / 40))} />
                    <Sequence from={motifAt}>
                        <Motif placement={{ cx: 960, cy: 420, width: 1000 }} from={{ x: 520, y: 760 }} fromR={20} slow={slow} />
                    </Sequence>
                    <Words text="Your five-a-side, as seen on telly." v="bodyBold" size={50} x={960} y={636} align="center" inAt={Math.round(settled - 6)} style={{ textTransform: 'none' }} />
                    <Cta inAt={Math.round(settled + plan.beat)} />
                    <Words text="shooot.co.uk" v="mono" size={30} color={C.muted} x={960} y={900} align="center" inAt={Math.round(settled + plan.beat * 2)} tracking="0.08em" style={{ textTransform: 'none' }} />
                </Ground>
            )}
            <Sequence from={motifAt}>
                <Sfx name="ball-strike" at={MOTIF.kick * slow - 1} volume={0.9} />
                <Sfx name="net-swish" at={MOTIF.impact * slow - 1} volume={0.9} />
            </Sequence>
            <Sfx name="whistle-final" at={plan.finalHit - (plan.total - len) - 4} volume={0.8} />
        </AbsoluteFill>
    )
}

/** The lime primary button. */
function Cta({ inAt }: { inAt: number }): React.ReactElement | null {
    const f = useCurrentFrame()
    if (f < inAt) return null
    const a = ease.backOut(clamp01((f - inAt) / 12))
    const t = ease.expoOut(clamp01((f - inAt - 3) / 10))
    return (
        <div style={{ position: 'absolute', left: 960, top: 770, transform: `translate(-50%, -50%) scale(${lerp(0.85, 1, a)})`, opacity: clamp01((f - inAt) / 4) }}>
            <div style={{ background: C.lime, borderRadius: 10, padding: '24px 44px', boxShadow: '0 20px 50px rgba(168,240,60,0.12)' }}>
                <div style={{ ...voice('heading'), fontWeight: 800, fontSize: 40, color: C.onLime, whiteSpace: 'nowrap', clipPath: `inset(-20% ${(1 - t) * 100}% -20% 0)` }}>
                    Join the waitlist — free early access
                </div>
            </div>
            <Cursor x={560} y={70} press={0} ring={0} />
        </div>
    )
}

// ─── The whole cut ──────────────────────────────────────────────────────────────────────────────────────────

export function demoDuration(media: Media): number {
    return demoPlan(media.grid, media.vo).total
}

export function Demo({ media }: DemoProps): React.ReactElement {
    const plan = demoPlan(media.grid, media.vo)
    const { at, len } = plan
    const track = `audio/music-${media.track}.mp3`
    const ducked = (x: number): number => {
        let d = 0
        for (const c of plan.vo) {
            const into = clamp01((x - c.from + 6) / 6)
            const outOf = clamp01((c.from + c.dur + 8 - x) / 10)
            d = Math.max(d, Math.min(into, outOf))
        }
        return lerp(0.9, 0.38, d)
    }
    const scene = (id: keyof typeof at, el: React.ReactElement): React.ReactElement => (
        <Sequence key={id} from={at[id]} durationInFrames={len[id]} name={id}>
            {el}
        </Sequence>
    )
    const sp = (id: keyof typeof at): SceneProps => ({ media, plan, len: len[id] })
    return (
        <AbsoluteFill style={{ background: C.ground }}>
            {scene('hook', <Hook {...sp('hook')} />)}
            {scene('moments', <Moments {...sp('moments')} />)}
            {scene('problem', <Problem {...sp('problem')} />)}
            {scene('chat', <GroupChat {...sp('chat')} />)}
            {scene('why', <Why {...sp('why')} />)}
            {scene('reveal', <Reveal {...sp('reveal')} />)}
            {scene('film', <FilmIt {...sp('film')} />)}
            {scene('tag', <TagIt {...sp('tag')} />)}
            {scene('setup', <Setup {...sp('setup')} />)}
            {scene('render', <RenderReel {...sp('render')} />)}
            {scene('full', <FullMatch {...sp('full')} />)}
            {scene('send', <SendIt {...sp('send')} />)}
            {scene('montage', <Montage {...sp('montage')} />)}
            {scene('end', <EndCard {...sp('end')} motifAt={plan.endMotif - at.end} />)}

            {plan.vo.map((c) => (
                <Sequence key={c.index} from={c.from} durationInFrames={c.dur + 14} name={`vo-${c.index + 1}`}>
                    {has(media, c.line.file) && <Html5Audio src={asset(c.line.file)} volume={1} />}
                    {c.index !== 2 && <VoCaption text={c.line.text} dur={c.dur + 4} align={c.index === 4 ? 'left' : 'center'} />}
                </Sequence>
            ))}
            {has(media, track) && <Html5Audio src={asset(track)} volume={ducked} />}
            <Sfx name="rec-beep" at={4} volume={0.6} />
            <Sfx name="whistle-short" at={Math.round(plan.beat * 4)} volume={0.6} />
        </AbsoluteFill>
    )
}
