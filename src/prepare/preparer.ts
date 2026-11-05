// The background preparer: while the user edits, keeps the unit cache filled for the exports as they currently stand, so Render only has
// to encode what the last edits changed. One pass at a time (full match first, then highlights); a pass asks the engine for the units the
// cache lacks (render/transcodeEngine, opts.prepare) and keeps them. The real export always wins: it aborts the pass and waits for it to stop.
//
// This file is the controller: when to run, when to stop, how fast, and what the pill says. Everything it needs from the app arrives through
// PrepareDeps, so it is tested without a browser (preparer.test.ts); wire.ts connects it to the app.
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { PrepareHooks, PrepareState } from '../render/types'
import type { CacheKind } from '../render/unitCache'
import type { ExportPlan } from '../utils/exportPlans'
import type { RenderRequest } from '../renderJobs'
import { PARALLEL_UNITS } from '../render/transcodePlan'
import { Gate } from './gate'
import { marginFor, spaceVerdict } from './space'
import type { PrepareRecord } from '../exportLog'

/** Quiet time after an edit before the plan is looked at again. */
export const EDIT_QUIET_MS = 20_000
/** Quiet time after a structural change (files, quality, project), which should start work soon. */
export const STRUCTURE_QUIET_MS = 1_500
/** Sleep between frames while the editor plays or scrubs (the preparer yields generously), and how long after the last move counts as scrubbing. */
export const PACE_MS = 12
export const BUSY_HOLD_MS = 2_000
/** Re-check the disk this often while a kind is blocked or running. */
export const SPACE_RECHECK_MS = 5 * 60_000
/** Room kept on top of the units when saving to a file (the preparer never fills the disk). */
export const FILE_RESERVE_BYTES = 500e6

export type Quality = '4k' | '1080p'
export type Wanted = { kind: CacheKind; quality: Quality; plan: ExportPlan }

export type PrepareStatus =
    | { kind: 'hidden' }
    | { kind: 'preparing'; what: string; percent: number }
    | { kind: 'paused'; byUser: boolean }
    | { kind: 'ready'; text: string }
    | { kind: 'nospace'; text: string }

export type PrepareUi = {
    status: PrepareStatus
    /** Per kind: the quality prepared and how much of it is ready (for the Export panel's time hint). */
    shares: Partial<Record<CacheKind, { quality: Quality; signature: string; state: PrepareState }>>
    paused: boolean
}

export type PassArgs = { plan: ExportPlan; request: RenderRequest; signal: AbortSignal; hooks: PrepareHooks }

export type PrepareDeps = {
    /** What to prepare right now, from the current project; [] when nothing (no files, Original, proxies only…). Cheap and pure. */
    wanted: () => Wanted[]
    /** Id of the open project, to forget everything on a switch and to remember Pause. */
    projectId: () => string | null
    projectName: () => string | null
    requestFor: (plan: ExportPlan) => Promise<RenderRequest>
    runPass: (a: PassArgs) => Promise<void>
    /** The site's storage: bytes a prepare could use (free space plus the reclaimable cache); null = unknown. */
    available: () => Promise<number | null>
    savesToFile: () => boolean
    loadPaused: (projectId: string | null) => boolean
    savePaused: (projectId: string | null, paused: boolean) => void
    /** Keeps the screen awake while a pass runs. */
    wakeLock?: () => { acquire: () => Promise<void>; release: () => Promise<void> }
    log: (r: PrepareRecord) => void
    device: () => string
    now: () => number
    /** Timers (replaced in tests). */
    timers?: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void }
    sleep?: (ms: number) => Promise<void>
}

/** What the preparer did for a kind since the project was opened (goes into the export timing log). */
export type KindTotals = { wallMs: number; unitsEncoded: number; encodedSec: number; pausedMs: number; throttledMs: number }
const zero = (): KindTotals => ({ wallMs: 0, unitsEncoded: 0, encodedSec: 0, pausedMs: 0, throttledMs: 0 })

const NAMES: Record<CacheKind, string> = { fullMatch: 'full match', highlights: 'highlights' }
const LABEL: Record<Quality, string> = { '4k': '4K', '1080p': '1080p' }
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export class Preparer {
    readonly store: StoreApi<PrepareUi>
    private readonly gate = new Gate(PARALLEL_UNITS)
    private holds = 0
    private busy = false
    private paused = false
    private stopped = true
    private projectId: string | null = null
    private cycling: Promise<void> | null = null
    private again = false
    private pass: { ctl: AbortController; kind: CacheKind; signature: string } | null = null
    private timer: unknown = null
    private recheck: unknown = null
    /** kind -> signature of the plan that was prepared completely. */
    private done = new Map<CacheKind, string>()
    /** kind -> why it cannot be prepared (not enough space). */
    private blocked = new Map<CacheKind, string>()
    /** kind -> signature of a plan whose pass failed (not tried again until the plan changes). */
    private failed = new Map<CacheKind, string>()
    private totals = new Map<CacheKind, KindTotals>()
    private lastHeld = 0
    private idleWaiters: (() => void)[] = []
    private lock: ReturnType<NonNullable<PrepareDeps['wakeLock']>> | null = null

    private readonly deps: PrepareDeps

    constructor(deps: PrepareDeps) {
        this.deps = deps
        this.store = createStore<PrepareUi>()(() => ({ status: { kind: 'hidden' }, shares: {}, paused: false }))
    }

    private after(fn: () => void, ms: number): unknown { return (this.deps.timers?.set ?? ((f, m) => setTimeout(f, m)))(fn, ms) }
    private cancel(h: unknown): void { if (h !== null) (this.deps.timers?.clear ?? ((x) => clearTimeout(x as ReturnType<typeof setTimeout>)))(h) }

    // ---- life cycle and triggers ----

    start(): void {
        if (!this.stopped) return
        this.stopped = false
        this.projectId = this.deps.projectId()
        this.paused = this.deps.loadPaused(this.projectId)
        this.store.setState({ paused: this.paused })
        this.trigger(STRUCTURE_QUIET_MS)
        this.scheduleRecheck()
    }

    stop(): void {
        this.stopped = true
        this.cancel(this.timer); this.timer = null
        this.cancel(this.recheck); this.recheck = null
        this.interrupt()
    }

    private scheduleRecheck(): void {
        this.cancel(this.recheck)
        this.recheck = this.after(() => { this.blocked.clear(); this.trigger(0); this.scheduleRecheck() }, SPACE_RECHECK_MS)
    }

    /** The user edited the project (events, graphics, lengths…): look at the plan again after a quiet spell. */
    notifyEdit(): void { this.trigger(EDIT_QUIET_MS) }
    /** Files, quality, or the project itself changed: soon. */
    notifyStructure(): void {
        const id = this.deps.projectId()
        if (id !== this.projectId) {
            this.projectId = id
            this.paused = this.deps.loadPaused(id)
            this.done.clear(); this.blocked.clear(); this.failed.clear(); this.totals.clear()
            this.store.setState({ paused: this.paused, shares: {} })
            this.interrupt()
        }
        this.trigger(STRUCTURE_QUIET_MS)
    }
    /** The window got focus or the tab became visible: the disk may have changed. */
    notifyFocus(): void { if (this.blocked.size > 0) { this.blocked.clear(); this.trigger(0) } }

    /** The editor is playing or scrubbing: one unit at a time, with pauses between frames. */
    setBusy(busy: boolean): void {
        if (this.busy === busy) return
        this.busy = busy
        this.gate.setLimit(busy ? 1 : PARALLEL_UNITS)
    }

    setPaused(p: boolean): void {
        if (this.paused === p) return
        this.paused = p
        this.deps.savePaused(this.projectId, p)
        this.store.setState({ paused: p })
        if (p) this.interrupt()
        else this.trigger(0)
        this.refreshStatus()
    }

    /** An export is starting: stop the pass now. Returns the release to call when the export is over. */
    hold(): () => void {
        this.holds++
        if (this.holds === 1) this.lastHeld = this.deps.now()
        this.interrupt()
        this.refreshStatus()
        let released = false
        return () => {
            if (released) return
            released = true
            this.holds = Math.max(0, this.holds - 1)
            if (this.holds === 0) { this.addPaused(this.deps.now() - this.lastHeld); this.trigger(STRUCTURE_QUIET_MS * 2) }
            this.refreshStatus()
        }
    }

    /** Resolves when no pass is running (after hold(): the export may start its engine). */
    idle(): Promise<void> {
        if (!this.cycling) return Promise.resolve()
        return new Promise((r) => this.idleWaiters.push(r))
    }

    totalsFor(kind: CacheKind): KindTotals { return { ...(this.totals.get(kind) ?? zero()) } }

    private addPaused(ms: number): void {
        // Only counts while there was something left to prepare.
        for (const w of this.deps.wanted()) if (this.done.get(w.kind) !== w.plan.signature) { const t = this.totals.get(w.kind) ?? zero(); t.pausedMs += Math.max(0, ms); this.totals.set(w.kind, t) }
    }

    private interrupt(): void { this.pass?.ctl.abort() }

    private trigger(ms: number): void {
        if (this.stopped) return
        this.cancel(this.timer)
        this.timer = this.after(() => {
            this.timer = null
            // A pass for a plan that is no longer the plan stops; one that still is carries on.
            const p = this.pass
            if (p && !this.deps.wanted().some((w) => w.kind === p.kind && w.plan.signature === p.signature)) p.ctl.abort()
            void this.cycle()
        }, ms)
    }

    // ---- the cycle ----

    private cycle(): Promise<void> {
        if (this.cycling) { this.again = true; return this.cycling }
        this.cycling = (async () => {
            try {
                do {
                    this.again = false
                    await this.runOnce()
                } while (this.again && !this.stopped)
            } finally {
                this.cycling = null
                await this.lock?.release().catch(() => undefined)
                this.lock = null
                const waiters = this.idleWaiters.splice(0)
                for (const w of waiters) w()
                this.refreshStatus()
            }
        })()
        return this.cycling
    }

    private blockedNow(): boolean { return this.holds > 0 || this.paused || this.stopped }

    private async runOnce(): Promise<void> {
        const wanted = this.deps.wanted()
        // Forget what is no longer wanted (quality back to Original, files gone).
        for (const k of ['fullMatch', 'highlights'] as const) if (!wanted.some((w) => w.kind === k)) { this.done.delete(k); this.blocked.delete(k); this.dropShare(k) }
        this.refreshStatus()
        if (this.blockedNow()) return
        let committed = 0
        for (const w of wanted) {
            if (this.blockedNow()) return
            const verdict = await this.admit(w, committed)
            if (!verdict.fits) {
                if (!this.blocked.has(w.kind)) this.deps.log(this.record(w, 'no-space', 0, null, verdict.message ?? undefined))
                this.blocked.set(w.kind, verdict.message ?? 'Not enough space to prepare')
                this.refreshStatus()
                continue
            }
            this.blocked.delete(w.kind)
            committed += w.plan.bytes
            if (this.done.get(w.kind) === w.plan.signature || this.failed.get(w.kind) === w.plan.signature) continue
            await this.runPass(w)
        }
        this.refreshStatus()
    }

    private async admit(w: Wanted, committed: number): Promise<ReturnType<typeof spaceVerdict>> {
        const alt = w.quality === '4k' ? { label: '1080p', needBytes: Math.round(w.plan.bytes * (10_000_000 + 192_000) / (20_000_000 + 192_000)) } : null
        return spaceVerdict({
            what: NAMES[w.kind], qualityLabel: LABEL[w.quality], needBytes: w.plan.bytes, committedBytes: committed,
            marginBytes: marginFor(w.plan.bytes, this.deps.savesToFile()), availableBytes: await this.deps.available(), alternative: alt,
        })
    }

    private dropShare(k: CacheKind): void {
        const shares = { ...this.store.getState().shares }
        delete shares[k]
        this.store.setState({ shares })
    }

    private record(w: Wanted, outcome: PrepareRecord['outcome'], wallMs: number, s: { units: number; encodedSec: number; ready: number; total: number; paused: number; throttled: number } | null, error?: string): PrepareRecord {
        return {
            v: 1, type: 'prepare', at: new Date(this.deps.now()).toISOString(), project: this.deps.projectName(), kind: w.kind, quality: w.quality, outcome, device: this.deps.device(),
            wallSec: Math.round(wallMs / 100) / 10, unitsEncoded: s?.units ?? 0, encodedSec: Math.round((s?.encodedSec ?? 0) * 10) / 10, unitsReady: s?.ready ?? 0, unitsTotal: s?.total ?? 0,
            pausedSec: Math.round((s?.paused ?? 0) / 100) / 10, throttledSec: Math.round((s?.throttled ?? 0) / 100) / 10, ...(error ? { error } : {}),
        }
    }

    private async runPass(w: Wanted): Promise<void> {
        const ctl = new AbortController()
        this.pass = { ctl, kind: w.kind, signature: w.plan.signature }
        const t0 = this.deps.now()
        const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
        let first: PrepareState | null = null
        let last: PrepareState | null = null
        let throttled = 0
        try {
            if (!this.lock && this.deps.wakeLock) { this.lock = this.deps.wakeLock(); void this.lock.acquire().catch(() => undefined) }
            const request = await this.deps.requestFor(w.plan)
            if (ctl.signal.aborted) throw new DOMException('Render cancelled', 'AbortError')
            const hooks: PrepareHooks = {
                acquire: (signal) => this.gate.acquire(signal),
                pace: async () => {
                    if (!this.busy) return
                    const s = this.deps.now()
                    await sleep(PACE_MS)
                    throttled += this.deps.now() - s
                },
                reserveBytes: this.deps.savesToFile() ? FILE_RESERVE_BYTES : marginFor(w.plan.bytes, false),
                budgetBytes: Math.round(w.plan.bytes * 1.1),
                onState: (st) => {
                    first ??= st
                    last = st
                    this.store.setState({ shares: { ...this.store.getState().shares, [w.kind]: { quality: w.quality, signature: w.plan.signature, state: st } } })
                    this.refreshStatus()
                },
            }
            await this.deps.runPass({ plan: w.plan, request, signal: ctl.signal, hooks })
            this.done.set(w.kind, w.plan.signature)
            this.finishPass(w, 'ready', t0, first, last, throttled)
        } catch (e) {
            const outcome = isAbort(e) ? 'stopped' : e instanceof Error && e.name === 'PrepareFull' ? 'no-space' : 'failed'
            if (outcome === 'no-space') this.blocked.set(w.kind, 'Not enough space to finish preparing: the storage filled up meanwhile.')
            if (outcome === 'failed') {
                // Not retried until the plan changes: a failing plan must not loop.
                this.failed.set(w.kind, w.plan.signature)
                console.warn('Background prepare failed', e)
            }
            // Stopped because the plan changed (not because of a hold or Pause): look again with the new plan straight away.
            if (outcome === 'stopped' && !this.blockedNow()) this.again = true
            this.finishPass(w, outcome, t0, first, last, throttled, outcome === 'failed' ? errText(e) : undefined)
        } finally {
            this.pass = null
        }
    }

    private finishPass(w: Wanted, outcome: PrepareRecord['outcome'], t0: number, first: PrepareState | null, last: PrepareState | null, throttled: number, error?: string): void {
        const wall = this.deps.now() - t0
        const units = first && last ? Math.max(0, last.readyUnits - first.readyUnits) : 0
        const encodedSec = first && last ? Math.max(0, last.readySec - first.readySec) : 0
        const t = this.totals.get(w.kind) ?? zero()
        t.wallMs += wall; t.unitsEncoded += units; t.encodedSec += encodedSec; t.throttledMs += throttled
        this.totals.set(w.kind, t)
        // A pass that found everything in place is not worth a log line.
        if (units === 0 && outcome === 'ready') return
        this.deps.log(this.record(w, outcome, wall, { units, encodedSec, ready: last?.readyUnits ?? 0, total: last?.totalUnits ?? 0, paused: 0, throttled }, error))
    }

    // ---- what the pill says ----

    private refreshStatus(): void {
        const wanted = this.deps.wanted().filter((w) => this.failed.get(w.kind) !== w.plan.signature)
        const s = this.store.getState()
        let status: PrepareStatus
        if (wanted.length === 0) status = { kind: 'hidden' }
        else if (this.paused) status = { kind: 'paused', byUser: true }
        else if (this.holds > 0) status = { kind: 'paused', byUser: false }
        else if (this.pass) {
            const st = s.shares[this.pass.kind]?.state
            status = { kind: 'preparing', what: NAMES[this.pass.kind], percent: st && st.totalSec > 0 ? Math.floor(100 * st.readySec / st.totalSec) : 0 }
        } else if (this.blocked.size > 0) status = { kind: 'nospace', text: [...this.blocked.values()].join(' ') }
        else if (wanted.every((w) => this.done.get(w.kind) === w.plan.signature)) {
            const parts = wanted.map((w, i) => { const t = `${NAMES[w.kind]} ${LABEL[w.quality]}`; return i === 0 ? t[0].toUpperCase() + t.slice(1) : t })
            status = { kind: 'ready', text: `${parts.join(' and ')} ${wanted.length > 1 ? 'are' : 'is'} ready; the export will only redo what you change.` }
        } else {
            // Waiting for the quiet spell (or the next pass): show the kind with work left.
            const next = wanted.find((w) => this.done.get(w.kind) !== w.plan.signature)!
            const st = s.shares[next.kind]
            status = { kind: 'preparing', what: NAMES[next.kind], percent: st && st.signature === next.plan.signature && st.state.totalSec > 0 ? Math.floor(100 * st.state.readySec / st.state.totalSec) : 0 }
        }
        const prev = s.status
        if (JSON.stringify(prev) !== JSON.stringify(status)) this.store.setState({ status })
    }
}
