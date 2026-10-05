export type Cut = {
    sourceIndex: number
    startSec: number
    endSec: number
    speed?: number    // < 1 = slow motion (timestamps stretched by 1/speed); default 1
    silent?: boolean  // replace source audio with silence
    gain?: number     // audio volume factor (re-encodes the audio when not 1); default 1
}

export type RenderSource = {
    name: string
    file: File
}

export type RenderProgress = {
    cutIndex: number   // 0-based index of the cut being processed
    cutCount: number
    fraction: number   // 0..1 overall
}

export type RenderOptions = {
    onProgress: (p: RenderProgress) => void
    signal?: AbortSignal
}

export type RenderFn = (cuts: Cut[], sources: RenderSource[], opts: RenderOptions) => Promise<File | Blob>
