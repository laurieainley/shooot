import { ALL_FORMATS, CanvasSink, Input } from 'mediabunny'
import { fileSource } from '../render/fileSource'
import { TILE, type Frame, type GoalTile } from '../utils/ballSampling'

export type FrameWorkerIn =
    | { type: 'open'; file: File }
    | { type: 'tiles'; id: number; times: number[]; tiles: GoalTile[]; ahead: number }
    | { type: 'pull'; id: number }
    | { type: 'stop'; id: number }
export type FrameWorkerOut =
    | { type: 'opened'; frameSize: Frame }
    | { type: 'frame'; id: number; timeSec: number; images: ImageData[] }
    | { type: 'done'; id: number }
    | { type: 'error'; id?: number; message: string }

const post = (m: FrameWorkerOut, transfer: Transferable[] = []): void => (self as unknown as Worker).postMessage(m, transfer)
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

let input: Input | null = null
let sink: CanvasSink | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
/** Per running request: frames the main thread has room for, and the wake-up for the loop waiting on it. */
const runs = new Map<number, { credit: number; stopped: boolean; wake: (() => void) | null }>()

async function open(file: File): Promise<void> {
    input = new Input({ source: fileSource(file), formats: ALL_FORMATS })
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('No video track')
    // CanvasSink applies the track's rotation and colour conversion, so frames are upright, display-sized RGBA.
    sink = new CanvasSink(track, { poolSize: 2 })
    const c = new OffscreenCanvas(TILE, TILE).getContext('2d', { willReadFrequently: true })
    if (!c) throw new Error('Canvas is not available')
    ctx = c
    post({ type: 'opened', frameSize: { w: track.displayWidth, h: track.displayHeight } })
}

async function tiles(id: number, times: number[], goalTiles: GoalTile[], ahead: number): Promise<void> {
    if (!sink || !ctx) throw new Error('Not open')
    const run = { credit: ahead, stopped: false, wake: null as (() => void) | null }
    runs.set(id, run)
    const it = sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]()
    try {
        let i = 0
        for (;;) {
            // At most `ahead` frames wait on the main thread (each is a few hundred KB).
            while (run.credit <= 0 && !run.stopped) await new Promise<void>((r) => { run.wake = r })
            if (run.stopped) return
            const { value: wrapped, done } = await it.next()
            if (done) break
            const timeSec = times[i++]
            if (run.stopped) return
            if (!wrapped) continue
            const images = goalTiles.map((t) => {
                ctx!.clearRect(0, 0, TILE, TILE)
                ctx!.drawImage(wrapped.canvas as CanvasImageSource, t.sx, t.sy, t.sw, t.sh, 0, 0, TILE, TILE)
                return ctx!.getImageData(0, 0, TILE, TILE)
            })
            run.credit--
            post({ type: 'frame', id, timeSec, images }, images.map((im) => im.data.buffer))
        }
        post({ type: 'done', id })
    } finally {
        runs.delete(id)
        void it.return?.(undefined)
    }
}

self.onmessage = (e: MessageEvent<FrameWorkerIn>): void => {
    const m = e.data
    if (m.type === 'open') open(m.file).catch((err) => post({ type: 'error', message: message(err) }))
    else if (m.type === 'tiles') tiles(m.id, m.times, m.tiles, m.ahead).catch((err) => post({ type: 'error', id: m.id, message: message(err) }))
    else {
        const run = runs.get(m.id)
        if (!run) return
        if (m.type === 'pull') run.credit++
        else run.stopped = true
        run.wake?.()
    }
}
