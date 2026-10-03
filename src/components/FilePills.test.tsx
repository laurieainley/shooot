// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

const processVideoFiles = vi.fn()
vi.mock('../utils/processFiles', () => ({ processVideoFiles: (...a: unknown[]) => processVideoFiles(...a) }))

import { FilePills } from './FilePills'

const proxy: VideoSourceFile = { id: 'p', name: 'GL010226.LRV', kind: 'proxy', url: '', file: new File([''], 'GL010226.LRV'), durationSec: 600 }

describe('FilePills', () => {
    beforeEach(() => {
        processVideoFiles.mockReset()
        processVideoFiles.mockResolvedValue({ files: [], error: null })
        useAppState.setState({ files: [proxy], events: [], cumulativeOffsets: [0], currentFileIndex: 0 })
    })

    it('should attach a full MP4 added later to its proxy and process only the rest', async () => {
        const full = new File([''], 'GX010226.MP4')
        const other = new File([''], 'other.mp4')
        const { container } = render(<FilePills />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [full, other] } })
        await waitFor(() => expect(processVideoFiles).toHaveBeenCalled())
        expect(useAppState.getState().files[0].fullFile?.name).toBe('GX010226.MP4')
        expect(Array.from(processVideoFiles.mock.calls[0][0] as File[])).toEqual([other])
    })
})
