import type { VideoSourceFile } from '../types'
import type { RenderProgress, RenderSource } from '../render/types'

export type RenderQuality = 'full' | 'preview'

export function resolveRenderSources(
    files: VideoSourceFile[],
    quality: RenderQuality,
): { sources: RenderSource[]; missing: string[] } {
    const missing: string[] = []
    const sources = files.map((f): RenderSource => {
        if (quality === 'preview' || f.kind === 'full') return { name: f.name, file: f.file }
        if (f.fullFile) return { name: f.fullFile.name, file: f.fullFile }
        missing.push(f.name)
        return { name: f.name, file: f.file }
    })
    return { sources, missing }
}

export function formatRenderProgress(p: RenderProgress): string {
    const pct = `${Math.round(p.fraction * 100)}%`
    return p.stage ? `${p.stage} · ${pct}` : `Clip ${p.cutIndex + 1} of ${p.cutCount} · ${pct}`
}
