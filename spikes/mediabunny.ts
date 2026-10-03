import {
    ALL_FORMATS, BlobSource, EncodedAudioPacketSource, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, StreamTarget,
    type StreamTargetChunk,
} from 'mediabunny'

const log = (m: string): void => {
    document.getElementById('log')!.textContent += m + '\n'
    console.log(m)
}

// Chrome-only heap sampler (performance.memory is non-standard).
type PerfWithMemory = Performance & { memory?: { usedJSHeapSize: number } }
function startHeapSampler(): () => number {
    const mem = (): number => (performance as PerfWithMemory).memory?.usedJSHeapSize ?? 0
    let peak = mem()
    const id = setInterval(() => { peak = Math.max(peak, mem()) }, 100)
    return () => {
        clearInterval(id)
        return Math.max(peak, mem())
    }
}

async function run(file: File): Promise<void> {
    const t0 = performance.now()
    const stopHeap = startHeapSampler()
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    const v = await input.getPrimaryVideoTrack()
    const a = await input.getPrimaryAudioTrack()
    if (!v || !a || !v.codec || !a.codec) throw new Error('missing track/codec')
    log(`video ${v.codec} ${await v.getCodecParameterString()} | audio ${a.codec}`)

    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle('spike.mp4', { create: true })
    const writable = await handle.createWritable()
    const sink = new WritableStream<StreamTargetChunk>({
        write: (c) => writable.write({ type: 'write', position: c.position, data: c.data }),
        close: () => writable.close(),
    })
    const output = new Output({ format: new Mp4OutputFormat(), target: new StreamTarget(sink, { chunked: true }) })
    const vOut = new EncodedVideoPacketSource(v.codec)
    const aOut = new EncodedAudioPacketSource(a.codec)
    output.addVideoTrack(vOut)
    output.addAudioTrack(aOut)
    await output.start()

    const vSink = new EncodedPacketSink(v)
    const aSink = new EncodedPacketSink(a)
    const vMeta = { decoderConfig: (await v.getDecoderConfig())! }
    const aMeta = { decoderConfig: (await a.getDecoderConfig())! }
    let cursor = 0
    let first = true
    for (let i = 0; i < 10; i++) {
        const start = 60 + i * 120
        const end = start + 14
        const k0 = await vSink.getKeyPacket(start)
        const kEnd = await vSink.getKeyPacket(end)
        if (!k0) break
        const kStop = kEnd ? await vSink.getNextKeyPacket(kEnd) : null
        const cutStart = k0.timestamp
        const cutEnd = kStop ? kStop.timestamp : end
        const offset = cursor - cutStart
        for await (const p of vSink.packets(k0, kStop ?? undefined)) {
            await vOut.add(p.clone({ timestamp: p.timestamp + offset }), first ? vMeta : undefined)
            first = false
        }
        const aStart = await aSink.getPacket(cutStart)
        let aFirst = cursor === 0
        if (aStart) {
            for await (const p of aSink.packets(aStart)) {
                if (p.timestamp >= cutEnd) break
                const ts = p.timestamp + offset
                if (ts < cursor) continue
                await aOut.add(p.clone({ timestamp: ts }), aFirst ? aMeta : undefined)
                aFirst = false
            }
        }
        cursor += cutEnd - cutStart
        log(`cut ${i + 1}: ${cutStart.toFixed(3)}–${cutEnd.toFixed(3)} (${(performance.now() - t0) / 1000 | 0}s)`)
    }
    await output.finalize()
    const out = await handle.getFile()
    const peakHeap = stopHeap()
    log(`peak JS heap: ${(peakHeap / 1e6).toFixed(1)} MB`)
    log(`done: ${(out.size / 1e6).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
    ;(document.getElementById('out') as HTMLVideoElement).src = URL.createObjectURL(out)
}

document.getElementById('go')!.addEventListener('click', () => {
    const f = (document.getElementById('file') as HTMLInputElement).files?.[0]
    if (f) run(f).catch((e: unknown) => log(`ERROR: ${String(e)}`))
})
