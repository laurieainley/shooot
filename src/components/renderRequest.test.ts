// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderJobs, resetRenderJobs } from '../renderJobs'
import type { ExportPlan } from '../utils/exportPlans'

vi.mock('../render', () => ({ renderReel: vi.fn() }))
vi.mock('../graphics/prepare', () => ({ prepareSpec: vi.fn(async () => undefined) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))

import { reuseKeysFor, saveExportToFile, startExport } from './renderRequest'
import { partsSaveStore } from '../prepare/partsSave'

const plan = { cuts: [{ sourceIndex: 0, startSec: 0, endSec: 1 }], sources: [], outputName: 'match.mp4', signature: 's', kind: 'fullMatch', spec: undefined } as unknown as ExportPlan

describe('saveExportToFile', () => {
    beforeEach(() => { resetRenderJobs() })

    it('should end as a Failed export with the reason when the save dialog itself fails', async () => {
        vi.stubGlobal('showSaveFilePicker', async () => { throw new DOMException('Not allowed', 'SecurityError') })
        await saveExportToFile('fullMatch', plan, true)
        await vi.waitFor(() => expect(renderJobs().getState().job?.phase).toBe('failed'))
        expect(renderJobs().getState().job?.error).toContain('Could not open the save dialog')
        expect(renderJobs().getState().job?.diagnostics?.outcome).toBe('failed')
        vi.unstubAllGlobals()
    })
    it('should do nothing when the picker is cancelled', async () => {
        vi.stubGlobal('showSaveFilePicker', async () => { throw new DOMException('cancelled', 'AbortError') })
        await saveExportToFile('fullMatch', plan, true)
        expect(renderJobs().getState().job).toBeNull()
        vi.unstubAllGlobals()
    })
})

describe('startExport while prepared parts are being saved', () => {
    beforeEach(() => { resetRenderJobs(); partsSaveStore.setState({ phase: 'idle' }) })
    it('should not start a render (the file being saved points at the cache\'s parts)', () => {
        partsSaveStore.setState({ phase: 'saving' })
        startExport('fullMatch', 'full', plan, true)
        expect(renderJobs().getState().job).toBeNull()
        partsSaveStore.setState({ phase: 'idle' })
    })
})

describe('reuseKeysFor', () => {
    const footage = (lastModified: number, byte = 1): File => new File([new Uint8Array(3 * 1024 * 1024).fill(byte)], 'GX010042.MP4', { lastModified })
    const rePlan = (file: File): ExportPlan => ({ ...plan, sources: [{ name: 'GX010042.MP4', file }], output: { quality: '4k', videoBitrate: 20e6 } } as unknown as ExportPlan)
    it('should give portable keys that match the same footage read on another device (other modified time)', async () => {
        const here = (await reuseKeysFor(rePlan(footage(1))))!
        const there = (await reuseKeysFor(rePlan(footage(2))))!
        expect(here.portable).toBeDefined()
        expect(there.portable!.block(0, 0, 1)).toBe(here.portable!.block(0, 0, 1))
        expect(there.block(0, 0, 1)).not.toBe(here.block(0, 0, 1))
        const renamed = new File([new Uint8Array(3 * 1024 * 1024).fill(1)], 'GX010042 2.MP4', { lastModified: 9 })
        const copy = (await reuseKeysFor({ ...rePlan(renamed), sources: [{ name: 'GX010042 2.MP4', file: renamed }] } as ExportPlan))!
        expect(copy.portable!.block(0, 0, 1)).toBe(here.portable!.block(0, 0, 1)) // iOS renamed the copy
        const other = (await reuseKeysFor(rePlan(footage(3, 2))))!
        expect(other.portable!.block(0, 0, 1)).not.toBe(here.portable!.block(0, 0, 1))
    })
})
