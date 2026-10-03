export type Cut = {
    sourceIndex: number
    startSec: number
    endSec: number
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
