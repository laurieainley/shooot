import { describe, it, expect } from 'vitest'
import { resolveRenderSources, formatRenderProgress } from './renderSources'
import type { VideoSourceFile } from '../types'

const vf = (name: string, kind: 'full' | 'proxy', fullName?: string): VideoSourceFile => ({
    id: name, name, kind, url: '', file: new File([''], name),
    fullFile: fullName ? new File([''], fullName) : undefined,
})

describe('resolveRenderSources', () => {
    it('should use proxies as-is for preview', () => {
        const r = resolveRenderSources([vf('GL010226.LRV', 'proxy')], 'preview')
        expect(r).toEqual({ sources: [{ name: 'GL010226.LRV', file: expect.any(File) }], missing: [] })
    })

    it('should use attached full files for full render', () => {
        const r = resolveRenderSources([vf('GL010226.LRV', 'proxy', 'GX010226.MP4')], 'full')
        expect(r.sources[0].name).toBe('GX010226.MP4')
        expect(r.missing).toEqual([])
    })

    it('should list proxies without a full file as missing for full render', () => {
        const r = resolveRenderSources([vf('GL010226.LRV', 'proxy'), vf('a.mp4', 'full')], 'full')
        expect(r.missing).toEqual(['GL010226.LRV'])
    })
})

describe('formatRenderProgress', () => {
    it('should format clip count and percent', () => {
        expect(formatRenderProgress({ cutIndex: 2, cutCount: 12, fraction: 0.414 })).toBe('Clip 3 of 12 · 41%')
    })
})
