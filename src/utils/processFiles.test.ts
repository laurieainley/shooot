import { describe, it, expect, vi } from 'vitest'
import { processVideoFiles } from './processFiles'
import type { ProbedMetadata } from './probe'

vi.spyOn(URL, 'createObjectURL').mockImplementation((f) => `blob:${(f as File).name}`)

const file = (name: string): File => new File([''], name)
const ok = (codec: 'h264' | 'hevc', durationSec = 100): ProbedMetadata =>
    ({ accepted: true, playable: true, codec, durationSec, width: 1920, height: 1080 })

describe('processVideoFiles', () => {
    it('should use a playable proxy for playback and attach the full file', async () => {
        const probe = vi.fn(async (f: File) => (f.name.endsWith('LRV') ? ok('h264') : ok('hevc')))
        const r = await processVideoFiles([file('GX010226.MP4'), file('GL010226.LRV')], probe)
        expect(r.files).toHaveLength(1)
        expect(r.files[0]).toMatchObject({ name: 'GL010226.LRV', kind: 'proxy', codec: 'h264' })
        expect(r.files[0].fullFile?.name).toBe('GX010226.MP4')
    })

    it('should prefer the full file when only it is given', async () => {
        const r = await processVideoFiles([file('GX010226.MP4')], async () => ok('hevc'))
        expect(r.files[0]).toMatchObject({ name: 'GX010226.MP4', kind: 'full', codec: 'hevc' })
        expect(r.files[0].fullFile).toBeUndefined()
    })

    it('should keep an unplayable full file with a playbackIssue', async () => {
        const probe = async (): Promise<ProbedMetadata> =>
            ({ accepted: true, playable: false, codec: 'hevc', durationSec: 100, error: "Can't play HEVC in this browser" })
        const r = await processVideoFiles([file('GX010226.MP4')], probe)
        expect(r.files[0].playbackIssue).toBe("Can't play HEVC in this browser")
    })

    it('should drop unaccepted files and report the error', async () => {
        const probe = async (): Promise<ProbedMetadata> => ({ accepted: false, playable: false, error: 'x.THM: not an MP4/LRV file' })
        const r = await processVideoFiles([file('x.THM')], probe)
        expect(r.files).toEqual([])
        expect(r.error).toBe('x.THM: not an MP4/LRV file')
    })
})
