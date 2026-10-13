// How long a render takes, from what it actually does. One cost model serves three jobs: the "roughly N min" hint before
// a render, the work weights the engines use for progress (a re-encoded second costs 10-50x a copied one), and the
// device rates learned from finished renders. Pure apart from the localStorage helpers at the bottom.
//
// Work is counted in units, then priced per device class:
//   copy    source seconds stream-copied            -> kc x source Mbps
//   decode  source seconds decoded                  -> kd x source MP/s (x h264 factor) + kb x Mbps (reading the stream)
//   encode  seconds encoded                         -> ke x output MP/s (Original: x ko, the source-codec session encoder)
//   paint   output seconds drawn on a canvas        -> paint ms/frame (interpolated 1080p..4K) x output fps
// Original (stream copy) copies the clips and re-encodes only the key-frame regions around graphics and whole replays that
// carry a crop or the replay tag. 4K / 1080p decode and re-encode every frame; only cards, replay crops and overlay windows
// are painted. The coefficients are fitted to real-device runs (renderTime.test.ts keeps the fit honest).
import type { Cut } from '../render/types'
import { CARD_SEC, STING_SEC } from '../graphics/layout'
import { LONG_SIDE, outputFrameSec, type OutputQuality } from '../render/transcodePlan'

export type DeviceClass = 'android' | 'ipad' | 'desktop' | 'unknown'
export type Codec = 'h264' | 'hevc'

export type SourceFacts = {
    width: number
    height: number
    codec: Codec
    fps: number
    /** Container bytes per second of footage (file size / duration). */
    bytesPerSec: number
}

/** Typical GoPro-like footage, used until the real file has been read. */
export const DEFAULT_FACTS: SourceFacts = { width: 3840, height: 2160, codec: 'hevc', fps: 30, bytesPerSec: 90e6 / 8 }

export type Coef = {
    /** Copy: wall seconds per second of footage per Mbps of its bitrate. */
    kc: number
    /** Decode: wall seconds per second of footage per megapixel-per-second (HEVC). */
    kd: number
    /** Reading the stream into the decoder: wall seconds per second per Mbps. */
    kb: number
    /** H.264 decodes this much of the HEVC cost. */
    h264: number
    /** Encode: wall seconds per second of output per megapixel-per-second. */
    ke: number
    /** Original re-encodes in the source codec at the source size: this multiple of `ke`. */
    ko: number
    /** Milliseconds to paint one frame at 1080p and at 4K (graphics and the canvas draw). */
    paint1080: number
    paint4k: number
}

/** Fitted to the Pixel (Android Chrome), iPad (WebKit) and Mac Chrome benchmarks; unknown devices get the slowest set. */
export const DEFAULT_COEF: Record<DeviceClass, Coef> = {
    // Pixel: copy and HEVC regions are costly (Original is its slowest path); H.264 encode is cheap hardware.
    android: { kc: 0.00627, kd: 0.00199, kb: 0.00213, h264: 0.8, ke: 0.000258, ko: 17.5, paint1080: 20, paint4k: 26 },
    // iPad: decode cost is flat in the benchmarks (hardware), so it folds into the encode term.
    ipad: { kc: 0.0013, kd: 0, kb: 0, h264: 0.8, ke: 0.0029, ko: 0.359, paint1080: 3.4, paint4k: 9.5 },
    desktop: { kc: 0.0025, kd: 0.0018, kb: 0.00215, h264: 0.8, ke: 0.00151, ko: 1.75, paint1080: 8, paint4k: 30 },
    // Unknown devices: the slower bound.
    unknown: { kc: 0.00627, kd: 0.00199, kb: 0.00213, h264: 0.8, ke: 0.000258, ko: 17.5, paint1080: 20, paint4k: 26 },
}

/** Work of one section (or a whole render): the units that are priced. */
export type Units = {
    /** Source seconds copied as they are. */
    copySec: number
    /** Source seconds decoded. */
    decSec: number
    /** Seconds encoded (output seconds; Original: source seconds of the regions). */
    encSec: number
    /** Seconds whose frames are painted on a canvas. */
    paintSec: number
    /** Of encSec: title / full-time card seconds (no decoding). */
    cardSec: number
}

export const ZERO_UNITS: Units = { copySec: 0, decSec: 0, encSec: 0, paintSec: 0, cardSec: 0 }
export const addUnits = (a: Units, b: Units): Units => ({
    copySec: a.copySec + b.copySec, decSec: a.decSec + b.decSec, encSec: a.encSec + b.encSec, paintSec: a.paintSec + b.paintSec, cardSec: a.cardSec + b.cardSec,
})

/** A graphic over a cut: `whole` = it covers every frame of the cut (replay tag, score bug window running through it). */
export type WorkOverlay = { cutIndex: number; startSec: number; durationSec: number; whole?: boolean }

export type WorkInput = {
    cuts: Pick<Cut, 'startSec' | 'endSec' | 'speed' | 'crop'>[]
    overlays: WorkOverlay[]
    introSec: number
    outroSec: number
}

/** Key-frame spacing assumed for the regions Original re-encodes around a graphic (GoPro 1 s; phones 1-2 s). */
export const GOP_SEC = 1

export type WorkSection = { kind: 'intro' | 'cut' | 'outro'; index: number; units: Units; seconds: number }
export type WorkPlan = { sections: WorkSection[]; units: Units; seconds: number }

export type Pricing = { facts: SourceFacts; output: OutputQuality; coef: Coef }

const mp = (w: number, h: number): number => (w * h) / 1e6
const mbps = (f: SourceFacts): number => (f.bytesPerSec * 8) / 1e6

/** Output picture size: Original keeps the source's, 4K / 1080p scale the long side. */
export function outputSize(facts: SourceFacts, output: OutputQuality): { width: number; height: number; fps: number } {
    if (output === 'original') return { width: facts.width, height: facts.height, fps: facts.fps }
    const k = LONG_SIDE[output] / Math.max(facts.width, facts.height)
    return { width: Math.round(facts.width * k), height: Math.round(facts.height * k), fps: 1 / outputFrameSec(facts.fps) }
}

/** Wall seconds for some units. */
export function priceUnits(u: Units, p: Pricing): number {
    const { facts, coef: c } = p
    const out = outputSize(facts, p.output)
    const srcMp = mp(facts.width, facts.height)
    const outMp = mp(out.width, out.height)
    const copy = u.copySec * c.kc * mbps(facts)
    const decode = u.decSec * (c.kd * srcMp * facts.fps * (facts.codec === 'h264' ? c.h264 : 1) + c.kb * mbps(facts))
    const encode = u.encSec * c.ke * outMp * out.fps * (p.output === 'original' ? c.ko : 1)
    const paintMs = c.paint1080 + (c.paint4k - c.paint1080) * Math.min(1, Math.max(0, (outMp - 2.07) / (8.29 - 2.07)))
    const paint = u.paintSec * (paintMs / 1000) * out.fps
    return copy + decode + encode + paint
}

/** Total length of the union of intervals clipped to [lo, hi]. */
function unionLength(iv: [number, number][], lo: number, hi: number): number {
    const sorted = iv.map(([a, b]): [number, number] => [Math.max(lo, a), Math.min(hi, b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
    let total = 0
    let end = -Infinity
    for (const [a, b] of sorted) {
        if (b <= end) continue
        total += b - Math.max(a, end)
        end = b
    }
    return total
}

/** The work of one cut. Original: copy, with the GOPs around overlay windows (and whole replay cuts) re-encoded. 4K / 1080p: every frame. */
export function cutUnits(cut: WorkInput['cuts'][number], overlays: WorkOverlay[], output: OutputQuality): Units {
    const span = Math.max(0, cut.endSec - cut.startSec)
    if (span <= 0) return ZERO_UNITS
    const speed = cut.speed ?? 1
    const whole = !!cut.crop || overlays.some((o) => o.whole)
    const windows = overlays.map((o): [number, number] => [o.startSec, o.startSec + o.durationSec])
    if (output === 'original') {
        // Whole GOPs are kept: about one extra GOP per cut. Around a window: ~1.5 GOPs of key-frame slack each side.
        const lo = cut.startSec - GOP_SEC
        const hi = cut.endSec + GOP_SEC
        const region = whole ? span + GOP_SEC : unionLength(windows.map(([a, b]): [number, number] => [a - 1.5 * GOP_SEC, b + 1.5 * GOP_SEC]), lo, hi)
        const painted = whole ? span : unionLength(windows, cut.startSec, cut.endSec)
        return { copySec: span + GOP_SEC - region, decSec: region, encSec: region, paintSec: painted, cardSec: 0 }
    }
    const painted = whole ? span : unionLength(windows, cut.startSec, cut.endSec)
    return { copySec: 0, decSec: span, encSec: span / speed, paintSec: painted / speed, cardSec: 0 }
}

/** Every section of a render priced (intro card, cuts, outro card), and their total. */
export function planWork(input: WorkInput, p: Pricing): WorkPlan {
    const byCut = new Map<number, WorkOverlay[]>()
    for (const o of input.overlays) byCut.set(o.cutIndex, [...(byCut.get(o.cutIndex) ?? []), o])
    const section = (kind: WorkSection['kind'], index: number, units: Units): WorkSection => ({ kind, index, units, seconds: priceUnits(units, p) })
    const card = (sec: number): Units => ({ ...ZERO_UNITS, encSec: sec, paintSec: sec, cardSec: sec })
    const sections: WorkSection[] = [
        section('intro', -1, card(input.introSec)),
        ...input.cuts.map((c, i) => section('cut', i, cutUnits(c, byCut.get(i) ?? [], p.output))),
        section('outro', -1, card(input.outroSec)),
    ]
    return { sections, units: sections.reduce((a, s) => addUnits(a, s.units), ZERO_UNITS), seconds: sections.reduce((a, s) => a + s.seconds, 0) }
}

// ---- progress by work ----

/**
 * Progress as the share of estimated work done (not media time): a copied second and a re-encoded second weigh what they
 * cost. Never goes backwards, and reaches exactly 1 only from `finish()`.
 */
export class WorkMeter {
    private done = 0
    private shown = 0
    readonly total: number
    constructor(total: number) { this.total = total }
    /** Adds `work` (model seconds) as done. */
    add(work: number): void { this.done += Math.max(0, work) }
    /** Sets the work done outright (resuming, or a position inside a section: base + share of the section). */
    set(work: number): void { this.done = Math.max(0, work) }
    get work(): number { return this.done }
    /** Fraction 0..1 so far; held below 1 until finish(), and never lower than a value already shown. */
    fraction(): number {
        const f = this.total > 0 ? Math.min(0.999, this.done / this.total) : 0
        this.shown = Math.max(this.shown, f)
        return this.shown
    }
    finish(): number { this.shown = 1; return 1 }
}

/**
 * How much of a stream-copied cut's work is done when its source position has reached `t`: copying costs `copyRate` per
 * source second, the re-encoded `regions` (key-frame stretches around graphics) cost `regionRate`. 0..1.
 */
export function cutShare(t: number, start: number, end: number, regions: [number, number][], copyRate: number, regionRate: number): number {
    const overlap = (hi: number): number => regions.reduce((a, [x, y]) => a + Math.max(0, Math.min(y, hi, end) - Math.max(x, start)), 0)
    const cost = (hi: number): number => { const r = overlap(hi); return copyRate * Math.max(0, Math.min(hi, end) - start - r) + regionRate * r }
    const whole = cost(end)
    return whole > 0 ? Math.min(1, Math.max(0, cost(t) / whole)) : Math.min(1, Math.max(0, (t - start) / Math.max(1e-6, end - start)))
}

/** Footage facts from what an engine knows once the file is open (`fps` 0 / unknown = 30). */
export function factsOfSource(o: { width: number; height: number; codec: string | null | undefined; fps: number; bytes: number; seconds: number }): SourceFacts {
    return {
        width: o.width, height: o.height, codec: o.codec === 'hevc' ? 'hevc' : 'h264',
        fps: Number.isFinite(o.fps) && o.fps >= 10 && o.fps <= 240 ? o.fps : 30,
        bytesPerSec: o.seconds > 0 ? o.bytes / o.seconds : DEFAULT_FACTS.bytesPerSec,
    }
}

// ---- device class ----

type NavLike = { userAgent?: string; maxTouchPoints?: number; platform?: string }

/** Android / iPad (and iPhone: same WebKit) / desktop from the user agent; touch screens that say nothing else are unknown. */
export function detectDeviceClass(nav: NavLike | undefined = typeof navigator === 'undefined' ? undefined : navigator, coarse: boolean = hasCoarsePointer()): DeviceClass {
    const ua = nav?.userAgent ?? ''
    if (/Android/i.test(ua)) return 'android'
    if (/iPad|iPhone|iPod/i.test(ua)) return 'ipad'
    // iPadOS 13+ reports a Mac; a Mac with a touch screen is an iPad.
    if (/Macintosh/i.test(ua) && (nav?.maxTouchPoints ?? 0) > 1) return 'ipad'
    if (/Windows|Macintosh|X11|Linux|CrOS/i.test(ua) && !coarse) return 'desktop'
    return 'unknown'
}

function hasCoarsePointer(): boolean {
    try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches } catch { return false }
}

// ---- estimates ----

export type TimeEstimate = { seconds: number; low: number; high: number; basis: 'typical' | 'this device' }

/** Spread around the model: wider where the device is a guess. */
export const TYPICAL_SPREAD: [number, number] = [0.8, 1.3]
export const LEARNED_SPREAD: [number, number] = [0.9, 1.15]

/** Which learned rate applies: Original (copy + regions) or a re-encode at 4K / 1080p. */
export type RatePath = OutputQuality

export type Rates = Partial<Record<RatePath, { ratio: number; n: number }>>

export function estimateFromWork(modelSeconds: number, path: RatePath, rates: Rates | null): TimeEstimate {
    const learned = rates?.[path]
    if (learned && learned.n > 0 && Number.isFinite(learned.ratio) && learned.ratio > 0) {
        const seconds = modelSeconds * learned.ratio
        return { seconds, low: seconds * LEARNED_SPREAD[0], high: seconds * LEARNED_SPREAD[1], basis: 'this device' }
    }
    return { seconds: modelSeconds, low: modelSeconds * TYPICAL_SPREAD[0], high: modelSeconds * TYPICAL_SPREAD[1], basis: 'typical' }
}

/** The graphics of a plan as work input (spec overlays: the replay tag covers its whole cut). */
export function workInputOf(plan: { cuts: Cut[]; spec?: { intro?: unknown; outro?: { kind?: string } | unknown; overlays: { kind: string; cutIndex: number; startSec: number; durationSec: number }[] } | undefined }, sec: { card: number; sting: number }): WorkInput {
    const spec = plan.spec
    const outro = spec?.outro as { kind?: string } | undefined
    return {
        cuts: plan.cuts,
        overlays: (spec?.overlays ?? []).map((o) => ({ cutIndex: o.cutIndex, startSec: o.startSec, durationSec: o.durationSec, ...(o.kind === 'replayTag' ? { whole: true } : {}) })),
        introSec: spec?.intro ? sec.card : 0,
        outroSec: outro ? (outro.kind === 'sting' ? sec.sting : sec.card) : 0,
    }
}

/**
 * The pre-render estimate for a plan at an output quality. `facts` are the footage's (DEFAULT_FACTS until read); `device`
 * defaults to this browser's class; `rates` are the learned ones (read from localStorage when omitted).
 */
export function estimateRenderTime(
    input: WorkInput,
    o: { output: OutputQuality; facts?: SourceFacts | null; device?: DeviceClass; rates?: Rates | null },
): TimeEstimate {
    const device = o.device ?? detectDeviceClass()
    const work = planWork(input, { facts: o.facts ?? DEFAULT_FACTS, output: o.output, coef: DEFAULT_COEF[device] })
    return estimateFromWork(work.seconds, o.output, o.rates === undefined ? loadRates() : o.rates)
}

// ---- learned rates (localStorage) ----

export const RATES_KEY = 'shooot.renderRates.v1'
const SMOOTH = 0.5
const RATIO_MIN = 0.2
const RATIO_MAX = 6

export function loadRates(): Rates | null {
    try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(RATES_KEY)
        if (!raw) return null
        const v = JSON.parse(raw) as Rates
        return v && typeof v === 'object' ? v : null
    } catch {
        return null
    }
}

/** Folds one finished render (measured wall seconds against the model's seconds for the same work) into the rates. Pure. */
export function foldRate(rates: Rates | null, path: RatePath, modelSeconds: number, wallSeconds: number): Rates {
    const next: Rates = { ...(rates ?? {}) }
    if (!(modelSeconds > 5) || !(wallSeconds > 5)) return next // too short to measure: start-up noise
    const ratio = Math.min(RATIO_MAX, Math.max(RATIO_MIN, wallSeconds / modelSeconds))
    const prev = next[path]
    next[path] = prev && prev.n > 0 ? { ratio: prev.ratio + SMOOTH * (ratio - prev.ratio), n: prev.n + 1 } : { ratio, n: 1 }
    return next
}

/** Records a finished render. Never throws (private windows, blocked storage). */
export function recordRender(path: RatePath, modelSeconds: number, wallSeconds: number): void {
    try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(RATES_KEY, JSON.stringify(foldRate(loadRates(), path, modelSeconds, wallSeconds)))
    } catch { /* storage unavailable: the typical estimate stays */ }
}

/** What a running render is expected to take on this device: the model's seconds, scaled by the learned ratio when there is one. */
export function expectedWallSeconds(modelSeconds: number, path: RatePath, rates: Rates | null = loadRates()): number {
    return estimateFromWork(modelSeconds, path, rates).seconds
}

/** The stable entry point for the Export UI: seconds / low / high / basis for a plan (cuts + graphics spec) at an output quality. */
export function estimateRenderSeconds(plan: Parameters<typeof workInputOf>[0], output: OutputQuality, facts: SourceFacts | null): TimeEstimate {
    return estimateRenderTime(workInputOf(plan, { card: CARD_SEC, sting: STING_SEC }), { output, facts })
}
