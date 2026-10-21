// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderJobs, resetRenderJobs } from '../renderJobs'
import type { ExportPlan } from '../utils/exportPlans'

vi.mock('../render', () => ({ renderReel: vi.fn() }))
vi.mock('../graphics/prepare', () => ({ prepareSpec: vi.fn(async () => undefined) }))

import { saveExportToFile } from './renderRequest'

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
