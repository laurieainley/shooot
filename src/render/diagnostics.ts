// Render diagnostics: a collector the engine and graphics session fill during a render (collection only, it never changes
// what is rendered), the readable text report, and the last report kept in localStorage so it survives a reload.
import { PRODUCT_NAME } from '../brand'
import { trackVisibility, type VisibilityDoc } from './visibility'
import { paramSets, spsLimits, spsOf, toU8, type SpsLimits } from './nal'

export type ErrorInfo = { message: string; name?: string; stack?: string }

export function errorInfo(e: unknown): ErrorInfo {
    if (e instanceof Error) return { message: e.message, name: e.name, ...(e.stack ? { stack: e.stack } : {}) }
    return { message: String(e) }
}

export type Environment = {
    userAgent: string | null; platform: string | null; hardwareConcurrency: number | null; deviceMemory: number | null
    webCodecs: { videoEncoder: boolean; videoDecoder: boolean; audioEncoder: boolean; audioDecoder: boolean; offscreenCanvas: boolean }
}

type NavLike = { userAgent?: string; platform?: string; hardwareConcurrency?: number; deviceMemory?: number }

export function collectEnvironment(nav: NavLike | undefined = typeof navigator === 'undefined' ? undefined : navigator, g: Record<string, unknown> = globalThis as Record<string, unknown>): Environment {
    const has = (n: string): boolean => typeof g[n] !== 'undefined'
    return {
        userAgent: nav?.userAgent ?? null, platform: nav?.platform ?? null,
        hardwareConcurrency: nav?.hardwareConcurrency ?? null, deviceMemory: nav?.deviceMemory ?? null,
        webCodecs: { videoEncoder: has('VideoEncoder'), videoDecoder: has('VideoDecoder'), audioEncoder: has('AudioEncoder'), audioDecoder: has('AudioDecoder'), offscreenCanvas: has('OffscreenCanvas') },
    }
}

export type ParamsInfo = {
    /** hvcC general_level_idc byte / avcC AVCLevelIndication byte. */
    headerLevel: number | null
    headerProfile: number | null
    headerTier: number | null
    chromaFormat: number | null
    bitDepthLuma: number | null
    bitDepthChroma: number | null
    sps: SpsLimits | null
    error?: string
}

/** What an hvcC / avcC record says in its header and in its SPS. Never throws. */
export function describeParams(desc: AllowSharedBufferSource | undefined, hevc: boolean): ParamsInfo {
    const info: ParamsInfo = { headerLevel: null, headerProfile: null, headerTier: null, chromaFormat: null, bitDepthLuma: null, bitDepthChroma: null, sps: null }
    if (!desc) return { ...info, error: 'no description' }
    try {
        const b = toU8(desc)
        if (hevc) {
            if (b.length >= 23) {
                info.headerProfile = b[1] & 31
                info.headerTier = (b[1] >> 5) & 1
                info.headerLevel = b[12]
                info.chromaFormat = b[16] & 3
                info.bitDepthLuma = (b[17] & 7) + 8
                info.bitDepthChroma = (b[18] & 7) + 8
            }
        } else if (b.length >= 4) {
            info.headerProfile = b[1]
            info.headerLevel = b[3]
        }
        const sps = spsOf(paramSets(desc, hevc), hevc)
        if (!sps) return { ...info, error: 'no SPS in the record' }
        info.sps = spsLimits(sps, hevc)
    } catch (e) {
        info.error = errorInfo(e).message
    }
    return info
}

export type SourceInfo = {
    index: number; name: string; sizeBytes: number
    /** Mediabunny's codec ('hevc', 'avc'). */
    videoCodec: string | null
    /** WebCodecs codec string of the track. */
    codec: string
    codedWidth: number | null; codedHeight: number | null; displayWidth: number | null; displayHeight: number | null
    frameRate: number | null
    colorSpace: VideoColorSpaceInit | null
    params: ParamsInfo
}

export type SourceInput = {
    index: number; name: string; sizeBytes: number; videoCodec: string | null; codec: string
    description?: AllowSharedBufferSource
    codedWidth?: number; codedHeight?: number; displayWidth?: number; displayHeight?: number
    frameRate?: number | null; colorSpace?: VideoColorSpaceInit | null
}

export type EncoderTry = {
    codec: string; latencyMode: string; supported: boolean
    outcome: 'unsupported' | 'encode-failed' | 'no-description' | 'ok'
    config?: unknown; error?: ErrorInfo
    /** What the encoder produced: its codec string and SPS. */
    output?: { codec: string; params: ParamsInfo }
    /** Why the session did not use this working encoder. */
    rejected?: string
}

export type SampleEntryInfo = {
    mode: 'graphics' | 'join' | 'copy'
    codec: string
    params: ParamsInfo
    [extra: string]: unknown
}

export type GraphicOutcome = { label: string; reason: string; error?: ErrorInfo }
export type Outcome = 'running' | 'done' | 'failed' | 'cancelled'

export type DiagnosticsReport = {
    version: 1
    kind: 'highlights' | 'fullMatch'
    outputName: string
    startedAt: number
    finishedAt: number | null
    outcome: Outcome
    error?: ErrorInfo
    environment: Environment
    sources: SourceInfo[]
    output: { width: number | null; height: number | null; cardCodec: string | null }
    sampleEntry: SampleEntryInfo | null
    sampleEntryDecision: Record<string, unknown> | null
    encoders: EncoderTry[]
    finalEncoderConfig: unknown
    generated: { what: string; params: ParamsInfo | null; error?: ErrorInfo }[]
    graphics: { applied: string[]; skipped: GraphicOutcome[] }
    timingsMs: Record<string, number>
    /** Chrome throttles hidden tabs: how often the page was hidden during the render, and the screen wake lock outcome. */
    background?: { hiddenCount: number; hiddenMs: number; wakeLock: string }
    notes: string[]
}

export class RenderDiagnostics {
    private data: DiagnosticsReport
    private readonly now: () => number
    private readonly visibility: { stop: () => { hiddenCount: number; hiddenMs: number } }
    private readonly wakeLock: () => string

    constructor(o: { kind: 'highlights' | 'fullMatch'; outputName: string; now?: () => number; environment?: Environment; visibilityDoc?: VisibilityDoc; wakeLock?: () => string }) {
        this.now = o.now ?? Date.now
        this.visibility = trackVisibility('visibilityDoc' in o ? o.visibilityDoc : typeof document === 'undefined' ? undefined : document, this.now)
        this.wakeLock = o.wakeLock ?? (() => 'not requested')
        this.data = {
            version: 1, kind: o.kind, outputName: o.outputName, startedAt: this.now(), finishedAt: null, outcome: 'running',
            environment: o.environment ?? collectEnvironment(), sources: [], output: { width: null, height: null, cardCodec: null },
            sampleEntry: null, sampleEntryDecision: null, encoders: [], finalEncoderConfig: null, generated: [],
            graphics: { applied: [], skipped: [] }, timingsMs: {}, notes: [],
        }
    }

    /** Starts timing a phase; call the result to stop. Repeated phases add up. */
    begin(phase: string): () => void {
        const t0 = this.now()
        return () => { this.data.timingsMs[phase] = (this.data.timingsMs[phase] ?? 0) + (this.now() - t0) }
    }

    note(text: string): void { this.data.notes.push(text) }
    /** A first attempt with graphics failed: what it applied is no longer true. */
    clearApplied(): void { this.data.graphics.applied = [] }

    source(s: SourceInput): void {
        if (this.data.sources.some((x) => x.index === s.index)) return // a re-render without graphics opens the same files again
        const hevc = s.videoCodec === 'hevc'
        this.data.sources.push({
            index: s.index, name: s.name, sizeBytes: s.sizeBytes, videoCodec: s.videoCodec, codec: s.codec,
            codedWidth: s.codedWidth ?? null, codedHeight: s.codedHeight ?? null, displayWidth: s.displayWidth ?? null, displayHeight: s.displayHeight ?? null,
            frameRate: s.frameRate ?? null, colorSpace: s.colorSpace ?? null, params: describeParams(s.description, hevc),
        })
    }

    outputSize(width: number, height: number): void { this.data.output.width = width; this.data.output.height = height }
    cardCodec(codec: string): void { this.data.output.cardCodec = codec }
    sampleEntry(e: SampleEntryInfo): void { this.data.sampleEntry = e }
    sampleEntryDecision(d: Record<string, unknown>): void { this.data.sampleEntryDecision = d }
    encoderTry(t: EncoderTry): void { this.data.encoders.push(t) }
    rejectLastEncoder(reason: string): void {
        const last = this.data.encoders[this.data.encoders.length - 1]
        if (last) last.rejected = reason
    }
    finalEncoder(config: unknown): void { this.data.finalEncoderConfig = config }
    generated(what: string, params: ParamsInfo | null, error?: unknown): void {
        if (this.data.generated.length >= 60) return
        this.data.generated.push({ what, params, ...(error === undefined ? {} : { error: errorInfo(error) }) })
    }
    graphicApplied(label: string): void { if (label) this.data.graphics.applied.push(label) }
    graphicSkipped(label: string, reason: string, error?: unknown): void {
        if (label) this.data.graphics.skipped.push({ label, reason, ...(error === undefined ? {} : { error: errorInfo(error) }) })
    }

    report(outcome: Outcome, error?: unknown): DiagnosticsReport {
        const background = { ...this.visibility.stop(), wakeLock: this.wakeLock() }
        return { ...this.data, background, outcome, finishedAt: this.now(), ...(error === undefined ? {} : { error: errorInfo(error) }) }
    }
}

// ---- Text report ----

const hms = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`
const lim = (l: SpsLimits | null): string => (l ? `profile ${l.profile}${l.profileSpace ? ` space ${l.profileSpace}` : ''}, tier ${l.tier}, level ${l.level}, coded ${l.codedWidth}x${l.codedHeight}, dpb ${l.dpb}` : 'SPS not parsed')
const paramsLine = (p: ParamsInfo): string =>
    `${lim(p.sps)}; header level byte ${p.headerLevel ?? '?'}` +
    `${p.headerTier != null ? `, tier ${p.headerTier}` : ''}${p.bitDepthLuma != null ? `, ${p.bitDepthLuma}-bit` : ''}${p.chromaFormat != null ? `, chroma ${p.chromaFormat}` : ''}${p.error ? ` (${p.error})` : ''}`

export function formatReport(r: DiagnosticsReport): string {
    const L: string[] = []
    const h = (t: string): void => { L.push('', t) }
    L.push(`${PRODUCT_NAME} render diagnostics`, `Render: ${r.kind} -> ${r.outputName}`, `Started: ${hms(r.startedAt)}${r.finishedAt ? `   Finished: ${hms(r.finishedAt)}` : ''}`, `Outcome: ${r.outcome}`)
    if (r.error) L.push(`Error: ${r.error.message}`, ...(r.error.stack ? [r.error.stack] : []))
    h('ENVIRONMENT')
    const e = r.environment
    L.push(`User agent: ${e.userAgent}`, `Platform: ${e.platform}`, `CPU threads: ${e.hardwareConcurrency}   Device memory: ${e.deviceMemory ?? 'n/a'} GB`,
        `WebCodecs: ${Object.entries(e.webCodecs).map(([k, v]) => `${k}=${v ? 'yes' : 'NO'}`).join(', ')}`)
    h('SOURCES')
    if (r.sources.length === 0) L.push('(none opened)')
    for (const s of r.sources) {
        L.push(`#${s.index} ${s.name} (${mb(s.sizeBytes)})`, `  codec ${s.codec} [${s.videoCodec}], coded ${s.codedWidth}x${s.codedHeight}, display ${s.displayWidth}x${s.displayHeight}, ${s.frameRate ? `${s.frameRate.toFixed(2)} fps` : 'fps unknown'}`,
            `  colour space: ${s.colorSpace ? JSON.stringify(s.colorSpace) : 'none'}`, `  ${paramsLine(s.params)}`)
    }
    h('OUTPUT')
    L.push(`Output size: ${r.output.width}x${r.output.height}`, `Card/overlay codec string: ${r.output.cardCodec ?? 'n/a'}`)
    if (r.sampleEntry) L.push(`Sample entry (${r.sampleEntry.mode}): ${r.sampleEntry.codec}`, `  ${paramsLine(r.sampleEntry.params)}`)
    if (r.sampleEntryDecision) L.push(`Sample entry decision: ${JSON.stringify(r.sampleEntryDecision)}`)
    L.push('Encoder candidates:')
    if (r.encoders.length === 0) L.push('  (none tried)')
    for (const t of r.encoders) {
        L.push(`  ${t.codec} / ${t.latencyMode}: supported=${t.supported}, ${t.outcome}${t.rejected ? `, not used: ${t.rejected}` : ''}${t.error ? `, ${t.error.message}` : ''}`)
        if (t.output) L.push(`    output ${t.output.codec}: ${paramsLine(t.output.params)}`)
    }
    L.push(`Final encoder config: ${r.finalEncoderConfig ? JSON.stringify(r.finalEncoderConfig) : 'none'}`)
    L.push('Generated segments:')
    if (r.generated.length === 0) L.push('  (none)')
    for (const g of r.generated) L.push(`  ${g.what}: ${g.params ? paramsLine(g.params) : 'no SPS'}${g.error ? ` — ${g.error.message}` : ''}`)
    h('GRAPHICS')
    L.push(`Applied (${r.graphics.applied.length}): ${r.graphics.applied.join(', ') || 'none'}`, `Skipped (${r.graphics.skipped.length}):`)
    for (const g of r.graphics.skipped) L.push(`  ${g.label} — ${g.reason}`, ...(g.error?.stack ? [`    ${g.error.stack.split('\n').join('\n    ')}`] : g.error ? [`    ${g.error.message}`] : []))
    h('TIMINGS')
    for (const [k, v] of Object.entries(r.timingsMs)) L.push(`  ${k}: ${(v / 1000).toFixed(2)} s`)
    if (r.background) {
        const b = r.background
        h('BACKGROUND')
        L.push(`Hidden during the render: ${b.hiddenCount} time${b.hiddenCount === 1 ? '' : 's'}, ${(b.hiddenMs / 1000).toFixed(1)} s`, `Screen wake lock: ${b.wakeLock}`)
    }
    if (r.notes.length) { h('NOTES'); L.push(...r.notes.map((n) => `  ${n}`)) }
    h('JSON')
    L.push('```json', JSON.stringify(r, null, 2), '```')
    return L.join('\n')
}

// ---- Persistence ----

export type KeyValueStorage = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }
export const LAST_REPORT_KEY = 'shooot.lastRenderDiagnostics'
export const MAX_REPORT_BYTES = 200_000

const size = (r: unknown): number => JSON.stringify(r).length

/** The report cut down to `max` characters of JSON: stacks first, then the longest lists. */
export function capReport(r: DiagnosticsReport, max: number): DiagnosticsReport {
    if (size(r) <= max) return r
    const strip = (x: ErrorInfo | undefined): ErrorInfo | undefined => (x ? { message: x.message.slice(0, 500) } : x)
    let c: DiagnosticsReport = {
        ...r, error: strip(r.error),
        graphics: { ...r.graphics, skipped: r.graphics.skipped.map((g) => ({ ...g, error: strip(g.error) })) },
        generated: r.generated.map((g) => ({ ...g, error: strip(g.error) })),
    }
    if (c.error === undefined) delete c.error
    c = { ...c, notes: [...c.notes, 'stack traces dropped to fit the size cap'] }
    while (size(c) > max && (c.graphics.skipped.length > 1 || c.generated.length > 1 || c.encoders.length > 1)) {
        c = {
            ...c,
            graphics: { ...c.graphics, skipped: c.graphics.skipped.slice(0, Math.ceil(c.graphics.skipped.length / 2)), applied: c.graphics.applied.slice(0, 200) },
            generated: c.generated.slice(0, Math.ceil(c.generated.length / 2)),
            encoders: c.encoders.slice(0, Math.ceil(c.encoders.length / 2)),
        }
    }
    return c
}

const defaultStorage = (): KeyValueStorage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

export function saveLastReport(r: DiagnosticsReport, storage: KeyValueStorage | null = defaultStorage()): void {
    try { storage?.setItem(LAST_REPORT_KEY, JSON.stringify(capReport(r, MAX_REPORT_BYTES))) } catch { /* storage full or blocked */ }
}

export function loadLastReport(storage: KeyValueStorage | null = defaultStorage()): DiagnosticsReport | null {
    try {
        const raw = storage?.getItem(LAST_REPORT_KEY)
        if (!raw) return null
        const v = JSON.parse(raw) as Partial<DiagnosticsReport>
        return v && v.version === 1 && Array.isArray(v.sources) && v.graphics && Array.isArray(v.graphics.skipped) ? (v as DiagnosticsReport) : null
    } catch {
        return null
    }
}

type ConsoleLike = Pick<Console, 'groupCollapsed' | 'log' | 'groupEnd'>

/** End of every render: console group with the whole report, saved as the last report, handed to the caller. */
export function publishReport(r: DiagnosticsReport, o: { storage?: KeyValueStorage | null; console?: ConsoleLike; onReport?: (r: DiagnosticsReport) => void } = {}): void {
    const con = o.console ?? console
    try {
        con.groupCollapsed(`[${PRODUCT_NAME.toLowerCase()}] render diagnostics`)
        con.log(r)
        con.log(formatReport(r))
        con.groupEnd()
    } catch { /* logging must never fail a render */ }
    saveLastReport(r, o.storage)
    try { o.onReport?.(r) } catch { /* ignore */ }
}
