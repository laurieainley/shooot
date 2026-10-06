// Mixed frame sizes: the output takes the first used file's size; other files' footage is re-encoded scaled to cover it.
import type { CropRect } from '../types'

export type SourceRect = { sx: number; sy: number; sw: number; sh: number }

/** The part of a source frame to draw so it covers the whole destination (aspect kept, centre-cropped), optionally within a replay crop box. */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number, crop?: CropRect): SourceRect {
    const bx = crop ? crop.x * srcW : 0
    const by = crop ? crop.y * srcH : 0
    const bw = crop ? crop.w * srcW : srcW
    const bh = crop ? crop.h * srcH : srcH
    const want = dstW / dstH
    let sw = bw
    let sh = bh
    if (bw / bh > want) sw = bh * want
    else sh = bw / want
    return { sx: bx + (bw - sw) / 2, sy: by + (bh - sh) / 2, sw, sh }
}

export const sizeLabel = (w: number, h: number): string => `${w}×${h}`

export type MixedSizeFile = { name: string; width: number; height: number; /** Seconds of this file that will be re-encoded. */ seconds: number }

/** Re-encoding 4K → 1080p runs at about this many times real time in Chrome on a laptop (measured: 38 s of 4K took ~85 s). */
export const REENCODE_SPEED = 0.45

const duration = (sec: number): string => (sec < 90 ? `${Math.max(5, Math.round(sec / 5) * 5)} s` : `${Math.round(sec / 60)} min`)

/** The question asked before rendering footage of a different size than the output. */
export function mixedSizeNotice(files: MixedSizeFile[], outW: number, outH: number): string {
    const total = files.reduce((a, f) => a + f.seconds, 0)
    const list = files.map((f) => `${f.name} is ${sizeLabel(f.width, f.height)}`).join('; ')
    const them = files.length === 1 ? 'it' : 'they'
    return `${list}, not ${sizeLabel(outW, outH)} like the first file. ${them[0].toUpperCase()}${them.slice(1)} will be scaled to ${sizeLabel(outW, outH)} (centre-cropped to fit) — about ${duration(total / REENCODE_SPEED)} extra.`
}
