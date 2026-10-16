// Engine switches for the /bench "Experiments" section. Every field is optional. Only `targetFile` is reachable from the editor (the
// "Save to file…" buttons); with `RenderOptions.experiments` omitted the engines use their defaults (including parallel units, #1).

export type RenderExperiments = {
    /** #1: units encoded at the same time. The engine's default is PARALLEL_UNITS (2) for journaled renders and "Save to file…" renders; the bench forces 1, 2 or 3 here. */
    parallelUnits?: number
    /** #1: split cuts into units of this many seconds of output instead of SEGMENT_SEC (so there is something to run in parallel). */
    segmentSec?: number
    /** #7: VideoEncoder latencyMode (the engine's default is 'quality'). */
    latencyMode?: 'quality' | 'realtime'
    /** #9: encoder queue length the engine waits for after each frame (default 3). */
    encodeQueue?: number
    /** #9: decoded pictures read ahead of the painting/encoding loop (default 0 = only what Mediabunny itself queues). */
    decodeAhead?: number
    /** #2: false turns the unit cache off for this render (it is on whenever the caller supplies `RenderOptions.reuse`). */
    unitCache?: boolean
    /** #4: write the final MP4 straight into this user-chosen file instead of OPFS. The editor's "Save to file…" uses it too, with a non-resumable render (a journaled one stages every unit in OPFS). */
    targetFile?: FileSystemFileHandle
    /** #6: Original highlights only re-encode the GOPs under the part of an overlay that is actually visible. */
    tightSpans?: boolean
    /** #11: scale frames (and composite their graphics) with WebGPU instead of the encoder / WebGL / 2D canvas. Falls back if unavailable. */
    scaler?: 'webgpu'
}

/** Cheap counters of where a re-encode spends its time (milliseconds summed over all frames of all units). */
export type PipelineStats = {
    frames: number
    units: number
    /** Waiting for the next decoded picture. */
    decodeWaitMs: number
    /** Scaling, drawing the picture and painting overlays/cards, up to creating the VideoFrame. */
    paintMs: number
    /** Calling encoder.encode (queueing the frame). */
    encodeCallMs: number
    /** Waiting for the encoder queue to drain below the limit (back-pressure). */
    backpressureMs: number
    /** Writing finished packets out. */
    drainMs: number
    /** Wall time of each unit relative to the first unit's start, ms (shows whether units overlapped). */
    unitSpans: { unit: number; startMs: number; endMs: number }[]
    scalePath?: string
    /** Units that came from the unit cache, and how many units were cacheable. */
    reused?: { units: number; of: number }
    /** #11: frames made by the WebGPU path (0 when it was off or unavailable). */
    gpuFrames?: number
}

export const emptyStats = (): PipelineStats => ({ frames: 0, units: 0, decodeWaitMs: 0, paintMs: 0, encodeCallMs: 0, backpressureMs: 0, drainMs: 0, unitSpans: [] })
