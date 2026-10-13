// Opt-in engine switches for the /bench "Experiments" section. Every field defaults to off/undefined and nothing here is
// reachable from the editor: with `RenderOptions.experiments` omitted the engines behave exactly as before.
import type { LogRecord } from './packetLog'

/** What a cached render unit is, as the engine knows it (the bench turns this into a hash of the unit's inputs). */
export type UnitDescriptor = {
    kind: 'intro' | 'outro' | 'segment'
    /** Index into the cuts passed to the render (segments only). */
    cutIndex?: number
    firstFrame?: number
    /** Segments: the stretch of source footage the unit draws on, seconds. */
    sourceStartSec?: number
    sourceEndSec?: number
    frames: number
    /** First output frame of the unit on the output timeline. */
    startFrame: number
}

/** Bench-only prototype store for finished units, keyed by a hash of their inputs (#2, segment cache). */
export type UnitCache = {
    keyOf: (u: UnitDescriptor) => string | null
    /** Reads a stored unit; records come back with timestamps relative to the unit start. Null = miss. */
    load: (key: string) => Promise<{ records: AsyncIterable<LogRecord>; applied: string[] } | null>
    /** Stores a finished unit (records relative to the unit start). */
    save: (key: string, records: AsyncIterable<LogRecord>, applied: string[]) => Promise<void>
}

export type RenderExperiments = {
    /** #1: units (segments) encoded at the same time, each with its own decoder and encoder. Journaled renders only. Default 1. */
    parallelUnits?: number
    /** #1: split cuts into units of this many seconds of output instead of SEGMENT_SEC (so there is something to run in parallel). */
    segmentSec?: number
    /** #7: VideoEncoder latencyMode (the engine's default is 'quality'). */
    latencyMode?: 'quality' | 'realtime'
    /** #9: encoder queue length the engine waits for after each frame (default 3). */
    encodeQueue?: number
    /** #9: decoded pictures read ahead of the painting/encoding loop (default 0 = only what Mediabunny itself queues). */
    decodeAhead?: number
    /** #2: bench-only unit cache. */
    unitCache?: UnitCache
    /** #4: write the final MP4 straight into this user-chosen file instead of OPFS. */
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
    /** #11: frames made by the WebGPU path (0 when it was off or unavailable). */
    gpuFrames?: number
}

export const emptyStats = (): PipelineStats => ({ frames: 0, units: 0, decodeWaitMs: 0, paintMs: 0, encodeCallMs: 0, backpressureMs: 0, drainMs: 0, unitSpans: [] })
