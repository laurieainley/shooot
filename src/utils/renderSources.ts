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

/** A full match is one long stretch split around replays: "Clip 3 of 58" says nothing there, so it says what it is doing instead. */
export function formatRenderProgress(p: RenderProgress, kind?: 'highlights' | 'fullMatch' | 'clip'): string {
    const pct = `${Math.round(p.fraction * 100)}%`
    if (p.stage) return `${p.stage} · ${pct}`
    return kind === 'fullMatch' ? `Rendering the match · ${pct}` : `Clip ${p.cutIndex + 1} of ${p.cutCount} · ${pct}`
}

/** The files without full quality that these cuts actually read (an unused proxy-only file does not count). */
export function usedMissing(cuts: { sourceIndex: number }[], files: { name: string }[], missing: string[]): string[] {
    const used = new Set(cuts.map((c) => files[c.sourceIndex]?.name))
    return missing.filter((n) => used.has(n))
}
