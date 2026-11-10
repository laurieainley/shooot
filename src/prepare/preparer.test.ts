import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EDIT_QUIET_MS, Preparer, STRUCTURE_QUIET_MS, type PassArgs, type PrepareDeps, type Wanted } from './preparer'
import type { PrepareState } from '../render/types'
import type { PrepareRecord } from '../exportLog'
import type { ExportPlan } from '../utils/exportPlans'

const GB = 1024 ** 3
const plan = (kind: 'fullMatch' | 'highlights', signature: string, bytes = 5 * GB): ExportPlan => ({ cuts: [{ sourceIndex: 0, startSec: 0, endSec: 100 }], sources: [], missing: [], spec: undefined, outputName: 'x.mp4', kind, seconds: 100, bytes, resumable: true, signature, output: { quality: '4k', videoBitrate: 20e6 } })
const state = (ready: number): PrepareState => ({ totalUnits: 10, readyUnits: ready, totalSec: 100, readySec: ready * 10, intro: true, outro: true, cuts: [ready / 10] })

function setup(over: Partial<PrepareDeps> = {}) {
    let wanted: Wanted[] = [{ kind: 'fullMatch', quality: '4k', plan: plan('fullMatch', 's1') }]
    const passes: PassArgs[] = []
    const logs: PrepareRecord[] = []
    let pass: (a: PassArgs) => Promise<void> = async (a) => { a.hooks.onState(state(0)); a.hooks.onState(state(10)) }
    const paused = new Map<string | null, boolean>()
    const deps: PrepareDeps = {
        wanted: () => wanted, projectId: () => 'p1', projectName: () => 'Match',
        requestFor: async () => ({ cuts: [], sources: [], outputName: 'x', output: { quality: '4k', videoBitrate: 20e6 } }),
        runPass: async (a) => { passes.push(a); await pass(a) },
        available: async () => 100 * GB, savesToFile: () => true,
        loadPaused: (id) => paused.get(id) ?? false, savePaused: (id, p) => { paused.set(id, p) },
        log: (r) => { logs.push(r) }, device: () => 'desktop', now: () => Date.now(),
        ...over,
    }
    const p = new Preparer(deps)
    return { p, passes, logs, paused, setWanted: (w: Wanted[]) => { wanted = w }, setPass: (f: typeof pass) => { pass = f } }
}
const settle = async (ms = STRUCTURE_QUIET_MS + 10): Promise<void> => { await vi.advanceTimersByTimeAsync(ms) }
/** A pass that runs until it is aborted. */
const forever = (a: PassArgs): Promise<void> => new Promise((_, reject) => { a.signal.addEventListener('abort', () => reject(new DOMException('Render cancelled', 'AbortError'))) })

describe('Preparer', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('should start soon after files are linked, prepare the plan once, and say Ready', async () => {
        const { p, passes, logs } = setup()
        p.start()
        expect(p.store.getState().status.kind).toBe('hidden')
        await settle()
        expect(passes).toHaveLength(1)
        expect(p.store.getState().status).toMatchObject({ kind: 'ready', text: 'Full match 4K is ready; the export will only redo what you change.' })
        expect(p.store.getState().shares.fullMatch?.state.readyUnits).toBe(10)
        expect(logs.at(-1)).toMatchObject({ type: 'prepare', kind: 'fullMatch', outcome: 'ready', unitsEncoded: 10 })
        p.notifyStructure()
        await settle()
        expect(passes).toHaveLength(1) // nothing changed: nothing to do
    })

    it('should prepare the full match first, then highlights, and say so for both when ready', async () => {
        const { p, passes, setWanted } = setup()
        setWanted([{ kind: 'fullMatch', quality: '4k', plan: plan('fullMatch', 'a') }, { kind: 'highlights', quality: '4k', plan: plan('highlights', 'b') }])
        p.start()
        await settle()
        expect(passes.map((a) => a.plan.kind)).toEqual(['fullMatch', 'highlights'])
        expect(p.store.getState().status).toMatchObject({ kind: 'ready', text: 'Full match 4K and highlights 4K are ready; the export will only redo what you change.' })
    })

    it('should wait for a quiet spell after an edit, then prepare the new plan', async () => {
        const { p, passes, setWanted } = setup()
        p.start()
        await settle()
        setWanted([{ kind: 'fullMatch', quality: '4k', plan: plan('fullMatch', 's2') }])
        p.notifyEdit()
        await vi.advanceTimersByTimeAsync(EDIT_QUIET_MS - 1000)
        expect(passes).toHaveLength(1)
        p.notifyEdit() // another edit restarts the wait
        await vi.advanceTimersByTimeAsync(EDIT_QUIET_MS - 1000)
        expect(passes).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(2000)
        expect(passes).toHaveLength(2)
        expect(passes[1].plan.signature).toBe('s2')
    })

    it('should stop a pass whose plan is no longer the plan, and carry on with the new one', async () => {
        const { p, passes, setWanted, setPass } = setup()
        setPass(forever)
        p.start()
        await settle()
        expect(passes).toHaveLength(1)
        setPass(async () => undefined)
        setWanted([{ kind: 'fullMatch', quality: '4k', plan: plan('fullMatch', 's2') }])
        p.notifyStructure()
        await settle()
        expect(passes[0].signal.aborted).toBe(true)
        expect(passes).toHaveLength(2)
        expect(passes[1].plan.signature).toBe('s2')
    })

    it('should let a pass for an unchanged plan run on through an edit that did not change it', async () => {
        const { p, passes, setPass } = setup()
        let release!: () => void
        setPass(() => new Promise<void>((r) => { release = r }))
        p.start()
        await settle()
        p.notifyEdit()
        await vi.advanceTimersByTimeAsync(EDIT_QUIET_MS + 10)
        expect(passes[0].signal.aborted).toBe(false)
        release()
        await settle()
        expect(passes).toHaveLength(1)
    })

    it('should stop for an export at once, report idle once stopped, and resume when the export is done', async () => {
        const { p, passes, setPass } = setup()
        setPass(forever)
        p.start()
        await settle()
        const release = p.hold()
        expect(passes[0].signal.aborted).toBe(true)
        await p.idle()
        expect(p.store.getState().status).toMatchObject({ kind: 'paused', byUser: false })
        setPass(async () => undefined)
        await settle(60_000)
        expect(passes).toHaveLength(1) // held: nothing starts
        release()
        await settle(10_000)
        expect(passes).toHaveLength(2)
        expect(p.store.getState().status.kind).toBe('ready')
    })

    it('should stay stopped while the user has paused it, and remember that per project', async () => {
        const { p, passes, paused } = setup()
        p.start()
        p.setPaused(true)
        await settle(30_000)
        expect(passes).toHaveLength(0)
        expect(p.store.getState().status).toMatchObject({ kind: 'paused', byUser: true })
        expect(paused.get('p1')).toBe(true)
        p.setPaused(false)
        await settle()
        expect(passes).toHaveLength(1)
        expect(paused.get('p1')).toBe(false)
    })

    it('should start paused when the project was left paused', async () => {
        const { p, passes } = setup({ loadPaused: () => true })
        p.start()
        await settle(30_000)
        expect(passes).toHaveLength(0)
        expect(p.store.getState().paused).toBe(true)
    })

    it('should not start without room, show the warning, and start when room appears', async () => {
        let free = 6.1 * GB
        const { p, passes, logs, setWanted } = setup({ available: async () => free, savesToFile: () => true })
        setWanted([{ kind: 'fullMatch', quality: '4k', plan: plan('fullMatch', 's1', 14.2 * GB) }])
        p.start()
        await settle()
        expect(passes).toHaveLength(0)
        const status = p.store.getState().status
        expect(status.kind).toBe('nospace')
        expect((status as { text: string }).text).toContain('Needs 14.2 GB, 6.1 GB available')
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({ outcome: 'no-space' })
        free = 30 * GB
        p.notifyFocus()
        await settle(100)
        expect(passes).toHaveLength(1)
        expect(p.store.getState().status.kind).toBe('ready')
    })

    it('should count the export margin when it will build its file in browser storage', async () => {
        const { p, passes } = setup({ available: async () => 12 * GB, savesToFile: () => false })
        p.start()
        await settle()
        expect(passes).toHaveLength(0) // 5 GB of parts + 11 GB for the export > 12 GB
        expect(p.store.getState().status.kind).toBe('nospace')
    })

    it('should hide when there is nothing to prepare, and not run a failed plan again until it changes', async () => {
        const { p, passes, setWanted, setPass } = setup()
        setWanted([])
        p.start()
        await settle()
        expect(p.store.getState().status.kind).toBe('hidden')
        setWanted([{ kind: 'fullMatch', quality: '4k', plan: plan('fullMatch', 'f1') }])
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        setPass(async () => { throw new Error('encoder says no') })
        p.notifyStructure()
        await settle()
        expect(passes).toHaveLength(1)
        expect(p.store.getState().status.kind).toBe('hidden')
        p.notifyStructure()
        await settle()
        expect(passes).toHaveLength(1)
        warn.mockRestore()
    })

    it('should forget everything when another project opens', async () => {
        let id = 'p1'
        const { p, passes } = setup({ projectId: () => id })
        p.start()
        await settle()
        expect(passes).toHaveLength(1)
        id = 'p2'
        p.notifyStructure()
        await settle()
        expect(passes).toHaveLength(2) // the new project is prepared on its own
        expect(p.totalsFor('fullMatch').unitsEncoded).toBe(10)
    })

    it('should run one unit at a time while the editor is busy, and sleep between frames', async () => {
        const slept: number[] = []
        const { p, passes, setPass } = setup({ sleep: async (ms) => { slept.push(ms) } })
        let hooks!: PassArgs['hooks']
        setPass(async (a) => {
            hooks = a.hooks
            p.setBusy(true)
            const r1 = await a.hooks.acquire(a.signal)
            let second = false
            void a.hooks.acquire(a.signal).then(() => { second = true })
            await Promise.resolve()
            expect(second).toBe(false)
            await a.hooks.pace()
            p.setBusy(false)
            await Promise.resolve(); await Promise.resolve()
            expect(second).toBe(true)
            r1()
        })
        p.start()
        await settle()
        expect(slept).toEqual([12])
        expect(passes).toHaveLength(1)
        void hooks
        expect(p.totalsFor('fullMatch').throttledMs).toBeGreaterThanOrEqual(0)
    })

    describe('wake lock', () => {
        const lockSetup = (over: Partial<PrepareDeps> = {}) => {
            const events: string[] = []
            const wakeLock = () => ({ acquire: async () => { events.push('acquire') }, release: async () => { events.push('release') } })
            return { events, ...setup({ wakeLock, ...over }) }
        }
        it('should hold the lock only while a pass runs, and release it when the pass is done', async () => {
            const { p, events } = lockSetup()
            p.start()
            expect(events).toEqual([])
            await settle()
            expect(events).toEqual(['acquire', 'release'])
        })
        it('should not take a lock when nothing is wanted', async () => {
            const { p, events, setWanted } = lockSetup()
            setWanted([])
            p.start()
            await settle()
            expect(events).toEqual([])
        })
        it('should release it on pause and take it again on resume', async () => {
            const { p, events, setPass } = lockSetup()
            setPass(forever)
            p.start()
            await settle()
            expect(events).toEqual(['acquire'])
            p.setPaused(true)
            await settle(10)
            expect(events).toEqual(['acquire', 'release'])
            p.setPaused(false)
            await settle(10)
            expect(events).toEqual(['acquire', 'release', 'acquire'])
        })
        it('should release it when an export holds the preparer, and when the preparer stops', async () => {
            const { p, events, setPass } = lockSetup()
            setPass(forever)
            p.start()
            await settle()
            const release = p.hold()
            await p.idle()
            expect(events).toEqual(['acquire', 'release'])
            release()
            await settle(STRUCTURE_QUIET_MS * 2 + 10)
            expect(events).toEqual(['acquire', 'release', 'acquire'])
            p.stop()
            await settle(10)
            expect(events.at(-1)).toBe('release')
        })
        it('should release it when a pass fails', async () => {
            const { p, events, setPass } = lockSetup()
            setPass(async () => { throw new Error('boom') })
            vi.spyOn(console, 'warn').mockImplementation(() => undefined)
            p.start()
            await settle()
            expect(events).toEqual(['acquire', 'release'])
        })
    })
})
