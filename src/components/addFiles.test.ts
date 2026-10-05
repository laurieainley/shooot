import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppState } from '../state'
import type { ProbedMetadata } from '../utils/probe'
import type { VideoSourceFile } from '../types'

type Probe = (f: File) => Promise<ProbedMetadata>
const processVideoFiles = vi.fn<(files: File[], probe: Probe) => Promise<{ files: VideoSourceFile[]; error: string | null }>>()
vi.mock('../utils/processFiles', () => ({ processVideoFiles: (files: File[], probe: Probe) => processVideoFiles(files, probe) }))
vi.mock('../utils/probe', () => ({ probeVideoFile: vi.fn(async () => ({ accepted: true, playable: true, durationSec: 60 })) }))

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
