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
    stage?: string     // e.g. "Title card" while a graphic is being made
}

/** Draws one frame of a graphic at `tSec` into a context the size of the output video (cleared beforehand). */
export type FramePainter = (ctx: OffscreenCanvasRenderingContext2D, tSec: number) => void

/** A generated full-frame segment (title / full-time card) with silent audio. */
export type RenderCard = {
    label: string
    durationSec: number
    paint: FramePainter
    /** When set, `paint` draws a still card (any t) and the engine fades it to/from black by this level (0..1). */
    fade?: (tSec: number) => number
}

/** Graphics drawn over footage of one cut, from `startSec` (source time) for `durationSec`. */
export type RenderOverlay = {
    label: string
    cutIndex: number
    startSec: number
    durationSec: number
    paint: FramePainter
    /** Pixel rows the overlay can touch, for a frame of this size (only these are read back and blended). */
    rows: (width: number, height: number) => [number, number]
    /**
     * Cuts start at the key frame at/before their requested start and end with whole GOPs. 'fromCutStart': the overlay
     * starts with the cut's first frame (a caption carried on over a replay). 'wholeCut': it covers every frame of the cut
     * (score always on screen); `paint` still gets time from `startSec` (negative before it). 'stretchToCut': it covers
     * every frame of the cut and its own timeline is stretched over them (REPLAY tag: fades at the real edges).
     */
    anchor?: 'fromCutStart' | 'wholeCut' | 'stretchToCut'
}

export type RenderGraphics = { intro?: RenderCard; outro?: RenderCard; overlays: RenderOverlay[] }

export type GraphicsReport = { applied: string[]; skipped: { label: string; reason: string }[] }

export type RenderOptions = {
    onProgress: (p: RenderProgress) => void
    signal?: AbortSignal
    /** Optional match graphics. Any that cannot be made are left out (never failing the render) and reported. */
    graphics?: RenderGraphics
    onGraphics?: (report: GraphicsReport) => void
    /** Output file name (default highlights.mp4). */
    outputName?: string
    /**
     * Save progress after every unit (card / cut) so an interrupted render can carry on after a reload. The signature
     * identifies the render (plan, sources, graphics): a saved job with another signature is discarded.
     */
    resumable?: { signature: string; kind: 'highlights' | 'fullMatch' }
}

export type RenderFn = (cuts: Cut[], sources: RenderSource[], opts: RenderOptions) => Promise<File | Blob>
