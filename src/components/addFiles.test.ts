import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppState } from '../state'
import type { ProbedMetadata } from '../utils/probe'
import type { VideoSourceFile } from '../types'

type Probe = (f: File) => Promise<ProbedMetadata>
const processVideoFiles = vi.fn<(files: File[], probe: Probe) => Promise<{ files: VideoSourceFile[]; error: string | null }>>()
vi.mock('../utils/processFiles', () => ({ processVideoFiles: (files: File[], probe: Probe) => processVideoFiles(files, probe) }))
vi.mock('../utils/probe', () => ({ probeVideoFile: vi.fn(async () => ({ accepted: true, playable: true, durationSec: 60 })) }))
const loadPartsFile = vi.fn<(f: File) => Promise<void>>(async () => undefined)
vi.mock('../prepare/partsLoad', () => ({ loadPartsFile: (f: File) => loadPartsFile(f) }))

import { addPickedFiles, replacePickedFile } from './addFiles'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const sized = (name: string, bytes: number): File => {
    const f = new File([''], name)
    Object.defineProperty(f, 'size', { value: bytes })
    return f
}

describe('addPickedFiles', () => {
    beforeEach(() => {
        processVideoFiles.mockReset()
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], currentFileIndex: 0, opening: null })
    })

    it('should show which file is being opened while probing, then clear it', async () => {
        const seen: (string | null)[] = []
        processVideoFiles.mockImplementation(async (files, probe) => {
            for (const f of files) { await probe(f); seen.push(useAppState.getState().opening) }
            return { files: [vf('a.mp4')], error: null }
        })
        const pending = addPickedFiles([sized('GX010226.MP4', 11_900_000_000), sized('GX020226.MP4', 4_000_000_000)])
        expect(useAppState.getState().opening).toMatch(/^Opening /)
        await pending
        expect(seen).toEqual(['Opening GX010226.MP4 (11.9 GB)… +1 more', 'Opening GX020226.MP4 (4.0 GB)…'])
        expect(useAppState.getState().opening).toBeNull()
        expect(useAppState.getState().files.map((f) => f.name)).toEqual(['a.mp4'])
    })

    it('should clear the indicator when probing fails', async () => {
        processVideoFiles.mockRejectedValue(new Error('boom'))
        await expect(addPickedFiles([sized('x.mp4', 10)])).resolves.toBe('boom')
        expect(useAppState.getState().opening).toBeNull()
    })
})

describe('addPickedFiles with a prepared parts file', () => {
    beforeEach(() => {
        processVideoFiles.mockReset()
        loadPartsFile.mockClear()
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], currentFileIndex: 0, opening: null })
    })

    it('should hand a .shooot-parts file to the parts loader, not the video probe', async () => {
        const parts = sized('Whites v Colours · prepared parts.shooot-parts', 10)
        await expect(addPickedFiles([parts])).resolves.toBeNull()
        expect(processVideoFiles).not.toHaveBeenCalled()
        expect(loadPartsFile).toHaveBeenCalledWith(parts)
    })

    it('should add the videos picked with it first, then load the parts', async () => {
        const order: string[] = []
        processVideoFiles.mockImplementation(async () => { order.push('videos'); return { files: [vf('GX010042.MP4')], error: null } })
        loadPartsFile.mockImplementation(async () => { order.push('parts') })
        const parts = sized('m.SHOOOT-PARTS', 10)
        const video = sized('GX010042.MP4', 10)
        await addPickedFiles([parts, video])
        expect(Array.from(processVideoFiles.mock.calls[0][0])).toEqual([video])
        expect(order).toEqual(['videos', 'parts'])
        expect(useAppState.getState().files.map((f) => f.name)).toEqual(['GX010042.MP4'])
    })
})

describe('addPickedFiles with a renamed parts file', () => {
    beforeEach(() => {
        processVideoFiles.mockReset()
        loadPartsFile.mockClear()
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], currentFileIndex: 0, opening: null })
    })
    const partsBytes = (name: string): File => new File([new TextEncoder().encode('shooot-parts\n'), new Uint8Array([4, 0, 0, 0]), '{}  '], name)

    it('should know a parts file by its first bytes when iOS renamed it or dropped the extension', async () => {
        for (const name of ['prepared parts.bin', 'Matchday 3 - Whites v Colours · prepared parts']) {
            loadPartsFile.mockClear()
            const f = partsBytes(name)
            await addPickedFiles([f])
            expect(loadPartsFile).toHaveBeenCalledWith(f)
            expect(processVideoFiles).not.toHaveBeenCalled()
        }
    })

    it('should still probe a video whose first bytes are not the parts magic', async () => {
        processVideoFiles.mockResolvedValue({ files: [vf('clip.bin')], error: null })
        const v = new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], 'clip.bin')
        await addPickedFiles([v])
        expect(loadPartsFile).not.toHaveBeenCalled()
        expect(Array.from(processVideoFiles.mock.calls[0][0])).toEqual([v])
    })
})

describe('replacePickedFile', () => {
    beforeEach(() => {
        processVideoFiles.mockReset()
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], currentFileIndex: 0, opening: null, undoStack: [], redoStack: [] })
        useAppState.getState().setFiles([vf('a.mp4'), vf('b.mp4')])
        useAppState.getState().addEvent({ id: 'e', matchTimeSec: 5, sourceFileIndex: 0, type: 'goal' })
    })

    it('should swap one entry for the picked file and unlink events on the old one', async () => {
        processVideoFiles.mockResolvedValue({ files: [vf('c.mp4')], error: null })
        await replacePickedFile(0, [sized('c.mp4', 10)])
        expect(useAppState.getState().files.map((f) => f.name)).toEqual(['c.mp4', 'b.mp4'])
        expect(useAppState.getState().events[0]).toMatchObject({ id: 'e', unlinked: true })
    })

    it('should keep the list as it was when nothing usable was picked', async () => {
        processVideoFiles.mockResolvedValue({ files: [], error: 'Unsupported file' })
        await expect(replacePickedFile(0, [sized('c.txt', 10)])).resolves.toBe('Unsupported file')
        expect(useAppState.getState().files.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4'])
    })
})
