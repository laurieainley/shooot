import { describe, it, expect } from 'vitest'
import { fileBadges } from './fileBadges'
import type { VideoSourceFile } from '../types'

const base: VideoSourceFile = { id: 'x', name: 'x', url: '', file: new File([''], 'x'), kind: 'full' }

describe('fileBadges', () => {
    it('should show HEVC for HEVC full files', () => {
        expect(fileBadges({ ...base, codec: 'hevc' })).toEqual(['HEVC'])
    })
    it('should mark proxies with and without a full file', () => {
        expect(fileBadges({ ...base, kind: 'proxy', fullFile: new File([''], 'GX.MP4') })).toEqual(['proxy', 'full attached'])
        expect(fileBadges({ ...base, kind: 'proxy' })).toEqual(['proxy', 'preview only'])
    })
    it('should surface a playback issue', () => {
        expect(fileBadges({ ...base, playbackIssue: "Can't play HEVC" })).toEqual(["can't play here"])
    })
})
