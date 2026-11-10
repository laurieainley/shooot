// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const buildBundle = vi.fn()
vi.mock('./bundle', () => ({ buildBundle: (...a: unknown[]) => buildBundle(...a) }))
const release = vi.fn()
let idle: Promise<void> = Promise.resolve()
const holdPreparer = vi.fn<(why?: string) => { idle: Promise<void>; release: () => void }>(() => ({ idle, release }))
vi.mock('./control', () => ({ holdPreparer: (why?: string) => holdPreparer(why) }))

import { isSavingParts, partsSaveStore, savePreparedParts } from './partsSave'

const NAME = 'Whites v Colours · prepared parts.shooot-parts'
const blob = new Blob([new Uint8Array([1, 2, 3])])

describe('Save prepared parts', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        idle = Promise.resolve()
        partsSaveStore.setState({ phase: 'idle' })
        buildBundle.mockResolvedValue(blob)
        URL.createObjectURL = vi.fn(() => 'blob:parts')
        URL.revokeObjectURL = vi.fn()
    })
    afterEach(() => { delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker; vi.restoreAllMocks(); vi.useRealTimers() })

    it('should ask where to save (suggesting "<match> · prepared parts.shooot-parts") and write the file there', async () => {
        const written: unknown[] = []
        const writable = new WritableStream({ write: (c) => { written.push(c) } })
        const picker = vi.fn(async () => ({ name: NAME, createWritable: async () => writable }))
        ;(globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker
        await savePreparedParts({ name: NAME, projectId: 'm1', kinds: ['fullMatch'] })
        expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: NAME }))
        expect(buildBundle).toHaveBeenCalledWith('m1', { kinds: ['fullMatch'] })
        expect(written.length).toBeGreaterThan(0)
        expect(partsSaveStore.getState()).toMatchObject({ phase: 'saved', text: `Saved ${NAME}. Put it on the card with the match videos and add it with them on the other device.` })
    })

    it('should do nothing when the picker is cancelled', async () => {
        ;(globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => { throw new DOMException('no', 'AbortError') })
        await savePreparedParts({ name: NAME, projectId: 'm1', kinds: ['fullMatch'] })
        expect(buildBundle).not.toHaveBeenCalled()
        expect(holdPreparer).not.toHaveBeenCalled()
        expect(partsSaveStore.getState().phase).toBe('idle')
    })

    it('should download the file where there is no save picker (iPhone / iPad: Save to Files), holding everything for 60 s after', async () => {
        vi.useFakeTimers()
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe(NAME); expect(this.href).toContain('blob:parts') })
        const run = savePreparedParts({ name: NAME, projectId: 'm1', kinds: ['fullMatch', 'highlights'] })
        await vi.advanceTimersByTimeAsync(10)
        expect(click).toHaveBeenCalledTimes(1)
        // Safari reads the Blob while the user is in Save to Files: the cache's parts must stay put meanwhile.
        expect(partsSaveStore.getState()).toMatchObject({ phase: 'saving', url: 'blob:parts', name: NAME })
        expect(release).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(59_000)
        expect(isSavingParts()).toBe(true)
        await vi.advanceTimersByTimeAsync(1_100)
        await run
        expect(release).toHaveBeenCalledTimes(1)
        expect(partsSaveStore.getState()).toMatchObject({ phase: 'saved', url: 'blob:parts', name: NAME })
        click.mockRestore()
        vi.useRealTimers()
    })

    it('should hold until the page is back when the user leaves for the Files sheet, at most 5 minutes', async () => {
        vi.useFakeTimers()
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        let vis: DocumentVisibilityState = 'visible'
        vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => vis)
        const flip = (v: DocumentVisibilityState): void => { vis = v; document.dispatchEvent(new Event('visibilitychange')) }
        const run = savePreparedParts({ name: NAME, projectId: 'm1', kinds: ['fullMatch'] })
        await vi.advanceTimersByTimeAsync(10)
        flip('hidden')
        await vi.advanceTimersByTimeAsync(120_000)
        expect(isSavingParts()).toBe(true) // still away
        flip('visible')
        await vi.advanceTimersByTimeAsync(10)
        await run
        expect(release).toHaveBeenCalledTimes(1)
        // Never back: the hold ends at 5 minutes.
        release.mockClear()
        const run2 = savePreparedParts({ name: NAME, projectId: 'm1', kinds: ['fullMatch'] })
        await vi.advanceTimersByTimeAsync(10)
        flip('hidden')
        await vi.advanceTimersByTimeAsync(299_000)
        expect(isSavingParts()).toBe(true)
        await vi.advanceTimersByTimeAsync(1_100)
        await run2
        expect(release).toHaveBeenCalledTimes(1)
        vi.useRealTimers()
    })

    it('should keep the preparer stopped and Render blocked while the file is made', async () => {
        let during: boolean[] = []
        let letGo: () => void = () => undefined
        idle = new Promise<void>((r) => { letGo = r })
        buildBundle.mockImplementation(async () => { during = [isSavingParts(), release.mock.calls.length === 0]; return blob })
        ;(globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => ({ name: NAME, createWritable: async () => new WritableStream() }))
        const run = savePreparedParts({ name: NAME, projectId: 'm1', kinds: ['fullMatch'] })
        await new Promise((r) => setTimeout(r, 0))
        expect(isSavingParts()).toBe(true)
        expect(buildBundle).not.toHaveBeenCalled() // waits for the preparer's pass to stop
        letGo()
        await run
        expect(during).toEqual([true, true])
        expect(holdPreparer).toHaveBeenCalledWith('parts')
        expect(release).toHaveBeenCalledTimes(1)
        expect(isSavingParts()).toBe(false)
    })

    it('should show why saving failed, as the bundle says it', async () => {
        buildBundle.mockRejectedValue(new Error('A prepared part changed while the file was being made. Try saving again.'))
        await savePreparedParts({ name: NAME, projectId: 'm1', kinds: ['fullMatch'] })
        expect(partsSaveStore.getState()).toEqual({ phase: 'failed', text: 'A prepared part changed while the file was being made. Try saving again.' })
        expect(release).toHaveBeenCalledTimes(1)
    })
})
