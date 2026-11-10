import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'
import type { MatchEvent } from '../types'
import type { TransferPayload } from '../utils/projectTransfer'
import type { BundleImport } from './bundle'

const readBundleProject = vi.fn()
const importBundle = vi.fn()
vi.mock('./bundle', () => ({ readBundleProject: (...a: unknown[]) => readBundleProject(...a), importBundle: (...a: unknown[]) => importBundle(...a) }))
const applyTransferPayload = vi.fn()
vi.mock('../components/applyProject', () => ({ applyTransferPayload: (p: unknown) => applyTransferPayload(p) }))
const release = vi.fn()
const holdPreparer = vi.fn<(why?: string) => { idle: Promise<void>; release: () => void }>(() => ({ idle: Promise.resolve(), release }))
const refreshPreparer = vi.fn()
vi.mock('./control', () => ({ holdPreparer: (why?: string) => holdPreparer(why), refreshPreparer: () => refreshPreparer() }))
const showToast = vi.fn()
vi.mock('../toasts', () => ({ showToast: (t: string) => showToast(t) }))

import { answerReplace, cancelPartsLoad, dismissPartsNotice, loadPartsFile, partsLoadStore, partsLoaded } from './partsLoad'

const ev = (id: string): MatchEvent => ({ id, matchTimeSec: 5, sourceFileIndex: 0, type: 'goal' }) as MatchEvent
const project = (events: MatchEvent[]): TransferPayload => ({ events, teams: [] }) as unknown as TransferPayload
const done = (o: Partial<BundleImport> = {}): BundleImport => ({ project: project([ev('b')]), imported: 12, refused: null, device: 'Android phone', cancelled: false, skipped: { space: 0, damaged: 0, failed: 0 }, ...o })
const file = new File(['x'], 'Whites v Colours · prepared parts.shooot-parts')
const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve() }

describe('loading a prepared parts file', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        partsLoadStore.setState({ phase: 'idle' })
        useAppState.setState({ events: [] })
        readBundleProject.mockResolvedValue({ project: project([ev('b')]), device: 'Android phone', units: 12 })
        importBundle.mockResolvedValue(done())
    })

    it('should load the project and the parts, then toast "Loaded N prepared parts from <device>"', async () => {
        const before = partsLoaded()
        await loadPartsFile(file)
        expect(applyTransferPayload).toHaveBeenCalledWith(project([ev('b')]))
        expect(importBundle).toHaveBeenCalledWith(file, expect.any(Function), expect.any(AbortSignal))
        expect(showToast).toHaveBeenCalledWith('Loaded 12 prepared parts from Android phone')
        expect(partsLoadStore.getState()).toEqual({ phase: 'idle' })
        expect(partsLoaded()).toBe(before + 1)
    })

    it('should keep the preparer stopped while the parts are copied, then let it look again at once', async () => {
        let held = false
        importBundle.mockImplementation(async () => { held = holdPreparer.mock.calls.length === 1 && release.mock.calls.length === 0; return done() })
        await loadPartsFile(file)
        expect(held).toBe(true)
        expect(holdPreparer).toHaveBeenCalledWith('parts') // the pill says why, not "exporting"
        expect(release).toHaveBeenCalledTimes(1)
        expect(refreshPreparer).toHaveBeenCalledTimes(1)
    })

    it('should show progress while the parts are copied', async () => {
        let seen: unknown = null
        importBundle.mockImplementation(async (_f: File, onProgress: (d: number, t: number) => void) => { onProgress(25, 100); seen = partsLoadStore.getState(); return done() })
        await loadPartsFile(file)
        expect(seen).toEqual({ phase: 'loading', device: 'Android phone', done: 25, total: 100 })
    })

    it('should ask before replacing a different match, and replace it when told to', async () => {
        useAppState.setState({ events: [ev('a')] })
        const run = loadPartsFile(file)
        await settle()
        expect(partsLoadStore.getState()).toEqual({ phase: 'confirm', device: 'Android phone', incoming: 1, existing: 1 })
        expect(importBundle).not.toHaveBeenCalled()
        answerReplace(true)
        await run
        expect(applyTransferPayload).toHaveBeenCalledTimes(1)
        expect(importBundle).toHaveBeenCalledTimes(1)
    })

    it('should keep the open project but still load the parts on "Keep mine"', async () => {
        useAppState.setState({ events: [ev('a')] })
        const run = loadPartsFile(file)
        await settle()
        answerReplace(false)
        await run
        expect(applyTransferPayload).not.toHaveBeenCalled()
        expect(importBundle).toHaveBeenCalledTimes(1)
    })

    it('should load nothing when the question is closed', async () => {
        useAppState.setState({ events: [ev('a')] })
        const run = loadPartsFile(file)
        await settle()
        cancelPartsLoad()
        await run
        expect(applyTransferPayload).not.toHaveBeenCalled()
        expect(importBundle).not.toHaveBeenCalled()
        expect(partsLoadStore.getState()).toEqual({ phase: 'idle' })
    })

    it('should not ask when the open match is the same one', async () => {
        useAppState.setState({ events: [ev('b')] })
        await loadPartsFile(file)
        expect(importBundle).toHaveBeenCalledTimes(1)
    })

    it('should stop copying on Cancel', async () => {
        let signal: AbortSignal | null = null
        importBundle.mockImplementation(async (_f: File, _p: unknown, s: AbortSignal) => { signal = s; cancelPartsLoad(); return done({ imported: 4, cancelled: s.aborted }) })
        await loadPartsFile(file)
        expect(signal!.aborted).toBe(true)
        expect(partsLoadStore.getState()).toEqual({ phase: 'notice', text: 'Loading stopped: 4 prepared parts were loaded, the rest will be encoded here.' })
        expect(release).toHaveBeenCalledTimes(1)
    })

    it('should show a refusal verbatim and keep it until dismissed', async () => {
        const refused = 'These prepared parts were made by a different version of the app, so they were skipped. The project was loaded.'
        importBundle.mockResolvedValue(done({ imported: 0, refused }))
        await loadPartsFile(file)
        expect(showToast).not.toHaveBeenCalled()
        expect(partsLoadStore.getState()).toEqual({ phase: 'notice', text: refused })
        dismissPartsNotice()
        expect(partsLoadStore.getState()).toEqual({ phase: 'idle' })
    })

    it('should say how many parts were skipped, besides the toast', async () => {
        importBundle.mockResolvedValue(done({ imported: 9, skipped: { space: 0, damaged: 3, failed: 0 } }))
        await loadPartsFile(file)
        expect(showToast).toHaveBeenCalledWith('Loaded 9 prepared parts from Android phone')
        expect(partsLoadStore.getState()).toEqual({ phase: 'notice', text: '3 parts were damaged and will be encoded here.' })
    })

    it('should say when the file is not a parts file', async () => {
        readBundleProject.mockResolvedValue(null)
        await loadPartsFile(file)
        expect(importBundle).not.toHaveBeenCalled()
        expect(partsLoadStore.getState()).toEqual({ phase: 'notice', text: 'This is not a prepared parts file.' })
    })

    it('should keep the open project when the file\'s project cannot be read, and still load the parts', async () => {
        useAppState.setState({ events: [ev('a')] })
        readBundleProject.mockResolvedValue({ project: null, device: 'iPad', units: 3 })
        importBundle.mockResolvedValue(done({ project: null, imported: 3, device: 'iPad' }))
        await loadPartsFile(file)
        expect(applyTransferPayload).not.toHaveBeenCalled()
        expect(showToast).toHaveBeenCalledWith('Loaded 3 prepared parts from iPad')
    })
})
