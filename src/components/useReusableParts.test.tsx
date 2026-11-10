// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ExportPlan } from '../utils/exportPlans'

const reusableParts = vi.fn(async () => ({ intro: false, outro: false, cuts: [false] }))
vi.mock('../render/unitCache', () => ({ reusableParts: () => reusableParts() }))
vi.mock('./renderRequest', () => ({ reuseKeysFor: async () => ({}) }))
vi.mock('../prepare/wire', () => ({ usePrepare: <T,>(sel: (s: { shares: object }) => T): T => sel({ shares: {} }) }))

import { useReusableParts } from './useReusableParts'
import { partsLoadedStore } from '../prepare/partsLoad'

const plan = { cuts: [{ sourceIndex: 0, startSec: 0, endSec: 1 }], sources: [], kind: 'fullMatch' } as unknown as ExportPlan

describe('useReusableParts', () => {
    it('should read the cache again for every quality after a prepared parts file was loaded', async () => {
        renderHook(() => useReusableParts('fullMatch', plan, false))
        await waitFor(() => expect(reusableParts).toHaveBeenCalledTimes(2)) // 4K and 1080p
        act(() => { partsLoadedStore.setState({ loads: partsLoadedStore.getState().loads + 1 }) })
        await waitFor(() => expect(reusableParts).toHaveBeenCalledTimes(4))
    })
})
