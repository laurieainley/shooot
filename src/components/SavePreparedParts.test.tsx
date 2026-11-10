// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { openMatchStore } from './openMatch'
import type { PrepareUi } from '../prepare/preparer'

const preparedSummary = vi.fn()
const buildBundle = vi.fn()
vi.mock('../prepare/bundle', () => ({ preparedSummary: (...a: unknown[]) => preparedSummary(...a), buildBundle: (...a: unknown[]) => buildBundle(...a) }))
let ui: PrepareUi = { status: { kind: 'hidden' }, shares: {}, paused: false }
vi.mock('../prepare/wire', () => ({ usePrepare: <T,>(sel: (s: PrepareUi) => T): T => sel(ui) }))
vi.mock('../prepare/control', () => ({ holdPreparer: () => ({ idle: Promise.resolve(), release: () => undefined }) }))

import { SavePreparedParts } from './SavePreparedParts'
import { partsSaveStore } from '../prepare/partsSave'

const share = (readyUnits: number) => ({ quality: '4k' as const, signature: 's', state: { totalUnits: 10, readyUnits, totalSec: 100, readySec: readyUnits * 10, intro: true, outro: true, cuts: [readyUnits / 10] } })

describe('SavePreparedParts', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        partsSaveStore.setState({ phase: 'idle' })
        ui = { status: { kind: 'hidden' }, shares: {}, paused: false }
        preparedSummary.mockResolvedValue({ units: 12, bytes: 1.3e9, byKind: { fullMatch: { units: 12, bytes: 1.3e9 } } })
        buildBundle.mockResolvedValue(new Blob(['x']))
        useAppState.setState({ matchdayLabel: null, teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#00f', roster: [] }] })
        openMatchStore.setState({ id: 'm1' })
    })

    it('should not show before the preparer has prepared anything for the open project', async () => {
        render(<SavePreparedParts kind="fullMatch" />)
        await Promise.resolve()
        expect(screen.queryByRole('button', { name: /Save prepared parts/ })).not.toBeInTheDocument()
    })

    it('should not show when the cache holds no prepared parts', async () => {
        ui = { ...ui, shares: { fullMatch: share(3) } }
        preparedSummary.mockResolvedValue({ units: 0, bytes: 0, byKind: {} })
        render(<SavePreparedParts kind="fullMatch" />)
        await waitFor(() => expect(preparedSummary).toHaveBeenCalled())
        expect(screen.queryByRole('button', { name: /Save prepared parts/ })).not.toBeInTheDocument()
    })

    it('should offer the parts with their size, for the kinds prepared for this project', async () => {
        ui = { ...ui, shares: { fullMatch: share(3), highlights: share(0) } }
        render(<SavePreparedParts kind="fullMatch" />)
        expect(await screen.findByRole('button', { name: 'Save prepared parts (1.2 GB)' })).toBeEnabled()
        expect(preparedSummary).toHaveBeenCalledWith({ kinds: ['fullMatch'] })
        expect(screen.getByText(/^12 parts prepared for the full match\./)).toBeInTheDocument()
    })

    it('should count the parts of the tab\'s kind and name the other kind\'s', async () => {
        ui = { ...ui, shares: { fullMatch: share(3), highlights: share(2) } }
        preparedSummary.mockResolvedValue({ units: 15, bytes: 1.3e9, byKind: { fullMatch: { units: 7, bytes: 1e9 }, highlights: { units: 8, bytes: 3e8 } } })
        render(<SavePreparedParts kind="highlights" />)
        expect(await screen.findByRole('button', { name: 'Save prepared parts (1.2 GB)' })).toBeInTheDocument()
        expect(screen.getByText(/^8 parts prepared for highlights · 7 for the full match\./)).toBeInTheDocument()
    })

    it('should save under the match name and say where it went', async () => {
        ui = { ...ui, shares: { fullMatch: share(3) } }
        const picker = vi.fn(async () => ({ name: 'Whites v Colours · prepared parts.shooot-parts', createWritable: async () => new WritableStream() }))
        ;(globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker
        render(<SavePreparedParts kind="fullMatch" />)
        await userEvent.click(await screen.findByRole('button', { name: /Save prepared parts/ }))
        expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Whites v Colours · prepared parts.shooot-parts' }))
        expect(await screen.findByText(/^Saved Whites v Colours · prepared parts\.shooot-parts\./)).toBeInTheDocument()
        expect(buildBundle).toHaveBeenCalledWith('m1', { kinds: ['fullMatch'] })
        delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker
    })

    it('should be busy while saving and show a failure as it is', async () => {
        ui = { ...ui, shares: { fullMatch: share(3) } }
        render(<SavePreparedParts kind="fullMatch" />)
        await screen.findByRole('button', { name: /Save prepared parts/ })
        partsSaveStore.setState({ phase: 'saving' })
        expect(await screen.findByRole('button', { name: 'Saving prepared parts…' })).toBeDisabled()
        partsSaveStore.setState({ phase: 'failed', text: 'A prepared part changed while the file was being made. Try saving again.' })
        expect(await screen.findByText('A prepared part changed while the file was being made. Try saving again.')).toBeInTheDocument()
    })
})
