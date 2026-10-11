import { ALL_FORMATS, CanvasSink, Input } from 'mediabunny'
import { fileSource } from '../render/fileSource'
import { yieldToEventLoop } from '../render/yield'
import { TILE, type Frame, type GoalTile } from '../utils/ballSampling'

export type FrameSource = {
    frameSize: Frame
    /** For each time, the decoded frame's tile regions as 384×384 images (one per tile, same order). */
    tilesAt: (timesSec: number[], tiles: GoalTile[], signal?: AbortSignal) => AsyncGenerator<{ timeSec: number; images: ImageData[] }>
    dispose: () => void
}

/** Decoded video frames of one file for the ball check (engine boundary: verified with real renders, no unit test). */
export async function createFrameSource(file: File): Promise<FrameSource> {
    const input = new Input({ source: fileSource(file), formats: ALL_FORMATS })
    try {
        const track = await input.getPrimaryVideoTrack()
        if (!track) throw new Error('No video track')
        // CanvasSink applies the track's rotation and colour conversion, so frames are upright, display-sized RGBA.
        const sink = new CanvasSink(track, { poolSize: 2 })
        const frameSize = { w: track.displayWidth, h: track.displayHeight }
        const out = new OffscreenCanvas(TILE, TILE)
        const ctx = out.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('Canvas is not available')
        return {
            frameSize,
            async *tilesAt(timesSec, tiles, signal) {
                let i = 0
                for await (const wrapped of sink.canvasesAtTimestamps(timesSec)) {
                    const timeSec = timesSec[i++]
                    if (signal?.aborted) throw new Error('Cancelled')
                    if (!wrapped) continue
                    const images = tiles.map((t) => {
                        ctx.clearRect(0, 0, TILE, TILE)
                        ctx.drawImage(wrapped.canvas as CanvasImageSource, t.sx, t.sy, t.sw, t.sh, 0, 0, TILE, TILE)
                        return ctx.getImageData(0, 0, TILE, TILE)
                    })
                    yield { timeSec, images }
                    await yieldToEventLoop()
                }
            },
            dispose: () => input.dispose(),
        }
    } catch (e) {
        input.dispose()
        throw e
    }
}
