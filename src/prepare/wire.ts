// Connects the Preparer to the app: the project state it plans from, the player's activity, the render jobs, storage and the log.
import { useStore } from 'zustand'
import { useAppState, type AppState } from '../state'
import { isPlayerPaused } from '../components/playerControl'
import { openMatchStore } from '../components/openMatch'
import { DESKTOP_QUERY, LANDSCAPE_QUERY, PORTRAIT_QUERY, TABLET_QUERY, pickLayout } from '../components/useMediaQuery'
import { requestFor } from '../components/renderRequest'
import { fullMatchExport, highlightsExport, planOutput, type ExportState, type ExportPlan } from '../utils/exportPlans'
import { resolveHighlightsQuality } from '../utils/outputQuality'
import { LONG_SIDE } from '../render/transcodePlan'
import { storageRoom } from '../render/storage'
import { discardJob } from '../render/renderJob'
import { createRenderWakeLock } from '../renderWakeLock'
import { fullLongSide } from './offer4k'
import { renderJobs } from '../renderJobs'
import { hasSavePicker } from '../utils/savePicker'
import { detectDeviceClass } from '../utils/renderTime'
import { appendRecord } from '../exportLog'
import { BUSY_HOLD_MS, Preparer, type PrepareDeps, type PrepareUi, type Wanted } from './preparer'
import { registerPreparerControl } from './control'

const PAUSED_KEY = (id: string | null): string => `shooot-prepare-paused:${id ?? 'none'}`

const mq = (q: string): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches
/** A touch screen as the main pointer: a phone or tablet, where the screen locks by itself and a pass would stop. */
export const isCoarsePointer = (): boolean => mq('(pointer: coarse)')
/** The preparer keeps the screen awake while a pass runs, on touch devices only (a desktop does not sleep mid-pass like a phone does). */
export const wakeLockDep = (coarse: boolean = isCoarsePointer()): PrepareDeps['wakeLock'] => (coarse ? () => createRenderWakeLock() : undefined)

const PREPARED_KEY = (id: string): string => `shooot-prepared:${id}`
export function rememberPrepared(id: string | null, percent: number): void {
    if (!id) return
    try { localStorage.setItem(PREPARED_KEY(id), String(Math.max(0, Math.min(100, Math.round(percent))))) } catch { /* not kept across reloads */ }
}
/** How much of the project's export is prepared (0..100): this session's live share, else what was remembered before a reload. */
export function preparedPercent(id: string | null, shares: PrepareUi['shares'] = appPreparer().store.getState().shares): number {
    const live = Object.values(shares).map((x) => (x && x.state.totalSec > 0 ? Math.floor(100 * x.state.readySec / x.state.totalSec) : 0))
    if (live.length > 0 && Math.max(...live) > 0) return Math.max(...live)
    if (!id) return 0
    try { return Math.max(0, Math.min(100, Number(localStorage.getItem(PREPARED_KEY(id))) || 0)) } catch { return 0 }
}

const isPhone = (): boolean => { const l = pickLayout({ landscapePhone: mq(LANDSCAPE_QUERY), tablet: mq(TABLET_QUERY), portrait: mq(PORTRAIT_QUERY), desktop: mq(DESKTOP_QUERY) }); return l === 'phone' || l === 'landscape' }

/** The slice of the app state the export plans read, and the choices that decide what is prepared. */
const planInputs = (s: AppState): unknown[] => [s.files, s.events, s.cumulativeOffsets, s.lengthBeforeGoalSec, s.lengthAfterGoalSec, s.replayBeforeSec, s.replayAfterSec, s.replaySpeed, s.graphics, s.teams, s.matchdayLabel, s.fullMatch, s.goalAreas, s.highlightsQuality, s.highlightsTeaser]

let memo: { inputs: unknown[]; phone: boolean; out: Wanted[] } | null = null

/** What to prepare for the current project (memoised on the state it reads: this is called on every progress update). */
export function wantedNow(): Wanted[] {
    const s = useAppState.getState()
    const inputs = planInputs(s)
    const phone = isPhone()
    if (memo && memo.phone === phone && memo.inputs.length === inputs.length && memo.inputs.every((x, i) => x === inputs[i])) return memo.out
    const out: Wanted[] = []
    if (s.files.length > 0) {
        const st: ExportState = {
            files: s.files, events: s.events, cumulativeOffsets: s.cumulativeOffsets, lengthBeforeGoalSec: s.lengthBeforeGoalSec, lengthAfterGoalSec: s.lengthAfterGoalSec,
            replayBeforeSec: s.replayBeforeSec, replayAfterSec: s.replayAfterSec, replaySpeed: s.replaySpeed, graphics: s.graphics, teams: s.teams, matchdayLabel: s.matchdayLabel,
            fullMatch: s.fullMatch, goalAreas: s.goalAreas, highlightsTeaser: s.highlightsTeaser,
        }
        const f0 = s.files[0]
        // 4K on footage that is not 4K is exported as Original (the Export panel says so): nothing to prepare then.
        const fits = (q: 'original' | '4k' | '1080p'): q is '4k' | '1080p' => q !== 'original' && !(q === '4k' && (fullLongSide(f0) ?? (f0.width && f0.height ? Math.max(f0.width, f0.height) : Infinity)) < LONG_SIDE['4k'] - 16)
        const add = (kind: 'fullMatch' | 'highlights', quality: '4k' | '1080p', plan: ExportPlan): void => { if (plan.output && plan.cuts.length > 0 && plan.missing.length === 0) out.push({ kind, quality, plan }) }
        if (fits(s.fullMatch.quality)) add('fullMatch', s.fullMatch.quality, fullMatchExport(st, 'full', planOutput(s.fullMatch.quality)))
        const hq = resolveHighlightsQuality(s.highlightsQuality, phone)
        if (fits(hq) && s.events.some((e) => !e.unlinked)) add('highlights', hq, highlightsExport(st, 'full', planOutput(hq)))
    }
    memo = { inputs, phone, out }
    return out
}

let instance: Preparer | null = null

export function appPreparer(): Preparer {
    instance ??= new Preparer({
        wanted: wantedNow,
        projectId: () => openMatchStore.getState().id,
        projectName: () => { const s = useAppState.getState(); return s.matchdayLabel?.trim() || (s.teams.length >= 2 ? `${s.teams[0].name} v ${s.teams[1].name}` : null) },
        requestFor: (plan) => requestFor(plan, () => undefined),
        runPass: async ({ plan, request, signal, hooks }) => {
            const engine = await import('../render')
            await engine.prepareReel(request.cuts, request.sources, {
                onProgress: () => undefined, signal, kind: plan.kind, outputName: 'prepare',
                ...(request.output ? { output: request.output } : {}), ...(request.reuse ? { reuse: request.reuse } : {}), ...(request.graphics ? { graphics: request.graphics } : {}),
                prepare: hooks,
            })
        },
        available: async () => (await storageRoom())?.free ?? null,
        savesToFile: hasSavePicker,
        loadPaused: (id) => { try { return localStorage.getItem(PAUSED_KEY(id)) === '1' } catch { return false } },
        savePaused: (id, p) => { try { if (p) localStorage.setItem(PAUSED_KEY(id), '1'); else localStorage.removeItem(PAUSED_KEY(id)) } catch { /* not kept across reloads */ } },
        wakeLock: wakeLockDep(),
        rememberProgress: rememberPrepared,
        log: (r) => { void appendRecord(r) },
        device: detectDeviceClass,
        now: () => Date.now(),
    })
    return instance
}

/** Starts the app's preparer and its listeners; returns the stop. */
export function startAppPreparer(): () => void {
    const p = appPreparer()
    void discardJob('prepare') // scratch left by a reload in the middle of a unit
    let lastMove = 0
    const unsubState = useAppState.subscribe((s, prev) => {
        if (s.currentTimeInFileSec !== prev.currentTimeInFileSec || s.currentFileIndex !== prev.currentFileIndex) lastMove = Date.now()
        if (s.files !== prev.files || s.fullMatch.quality !== prev.fullMatch.quality || s.highlightsQuality !== prev.highlightsQuality) { p.notifyStructure(); return }
        const a = planInputs(s)
        const b = planInputs(prev)
        if (a.some((x, i) => x !== b[i])) p.notifyEdit()
    })
    const unsubMatch = openMatchStore.subscribe((s, prev) => { if (s.id !== prev.id) p.notifyStructure() })
    // Any render (export, clip) holds the preparer for as long as it runs; startExport also holds it from the click, before the job exists.
    let release: (() => void) | null = null
    const unsubJobs = renderJobs().subscribe((s) => {
        const running = s.job?.phase === 'running' || s.stopping || s.queued
        if (running && !release) release = p.hold()
        else if (!running && release) { release(); release = null }
    })
    const poll = setInterval(() => p.setBusy(!isPlayerPaused() || Date.now() - lastMove < BUSY_HOLD_MS), 500)
    const onFocus = (): void => { if (document.visibilityState === 'visible') p.notifyFocus() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    registerPreparerControl({ hold: () => p.hold(), idle: () => p.idle(), totals: (k) => p.totalsFor(k) })
    p.start()
    return () => {
        registerPreparerControl(null)
        p.stop()
        unsubState(); unsubMatch(); unsubJobs()
        release?.()
        clearInterval(poll)
        window.removeEventListener('focus', onFocus)
        document.removeEventListener('visibilitychange', onFocus)
    }
}

export function usePrepare<T>(sel: (s: PrepareUi) => T): T {
    return useStore(appPreparer().store, sel)
}
