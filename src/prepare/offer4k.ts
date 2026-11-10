// The one-tap "Prepare 4K" offer for touch devices: Original (stream copy) leaves nothing to prepare, so on a phone or iPad left
// on a pub table the user is offered 4K, which the background preparer then encodes while they edit.
import { useAppState } from '../state'
import { LONG_SIDE } from '../render/transcodePlan'
import type { HighlightsQualityChoice } from '../utils/outputQuality'
import type { OutputQuality } from '../render/transcodePlan'
import type { VideoSourceFile } from '../types'

/** The long side of the full-quality MP4 behind a loaded file; undefined when only an LRV proxy (or nothing known) is loaded. */
export function fullLongSide(f: VideoSourceFile): number | undefined {
    const side = f.pair ? f.pair.full : f.kind === 'full' ? f : undefined
    return side?.width && side.height ? Math.max(side.width, side.height) : undefined
}

export type Offer4kInput = { fullMatchQuality: OutputQuality; highlightsQuality: HighlightsQualityChoice; files: VideoSourceFile[] }

/** True when the full match is on Original and at least one loaded file is a full 4K MP4 (not just its LRV proxy). */
export function offer4k(s: Offer4kInput): boolean {
    if (s.fullMatchQuality !== 'original') return false
    return s.files.some((f) => (fullLongSide(f) ?? 0) >= LONG_SIDE['4k'] - 16)
}

/** The user tapped Prepare 4K: the full match goes to 4K, and highlights too unless they were set explicitly. */
export function accept4k(): void {
    const s = useAppState.getState()
    s.setFullMatch({ quality: '4k' })
    if (s.highlightsQuality === 'auto') s.setHighlightsQuality('4k')
}
