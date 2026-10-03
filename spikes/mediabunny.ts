import {
    ALL_FORMATS, BlobSource, BufferTarget, CustomSource, EncodedAudioPacketSource, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, StreamTarget,
    type Source, type StreamTargetChunk, type Target,
} from 'mediabunny'

let lastOutput: File | null = null

const BLOCK = 8 * 1024 * 1024

// Reads only whole 8 MB blocks from the file (few, large reads), keeping the last few in memory.
function blockSource(file: File): Source {
    const cache = new Map<number, Promise<Uint8Array>>()
    const block = (i: number): Promise<Uint8Array> => {
        let p = cache.get(i)
        if (!p) {
            p = file.slice(i * BLOCK, Math.min(file.size, (i + 1) * BLOCK)).arrayBuffer().then((b) => new Uint8Array(b))
            cache.set(i, p)
            if (cache.size > 6) cache.delete(cache.keys().next().value!)
        }
        return p
    }
    return new CustomSource({
        getSize: () => file.size,
        read: async (start, end) => {
            const first = Math.floor(start / BLOCK)
            const last = Math.floor((end - 1) / BLOCK)
            const out = new Uint8Array(end - start)
            for (let i = first; i <= last; i++) {
                const b = await block(i)
                const bStart = i * BLOCK
                const from = Math.max(start, bStart) - bStart
                const to = Math.min(end, bStart + b.length) - bStart
                out.set(b.subarray(from, to), bStart + from - start)
            }
            return out
        },
        maxCacheSize: 16 * 1024 * 1024,
    })
}

function makeSource(file: File, mode: string): Source {
    if (mode === 'network') {
        return new CustomSource({
            getSize: () => file.size,
            read: async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
            prefetchProfile: 'network',
            maxCacheSize: 64 * 1024 * 1024,
        })
    }
    if (mode === 'blocks') return blockSource(file)
    return new BlobSource(file)
}

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
    const mode = (document.getElementById('source') as HTMLSelectElement).value
    log(`source: ${mode}`)
    const input = new Input({ source: makeSource(file, mode), formats: ALL_FORMATS })
    const v = await input.getPrimaryVideoTrack()
    const a = await input.getPrimaryAudioTrack()
    if (!v || !a || !v.codec || !a.codec) throw new Error('missing track/codec')
    log(`video ${v.codec} ${await v.getCodecParameterString()} | audio ${a.codec}`)

    const useMemory = (document.getElementById('memory') as HTMLInputElement).checked
    log(`UA: ${navigator.userAgent}`)
    log(`target: ${useMemory ? 'memory (BufferTarget)' : 'OPFS (StreamTarget)'}`)
    let target: Target
    let readOutput: () => Promise<File>
    if (useMemory) {
        const bt = new BufferTarget()
        target = bt
        readOutput = async () => new File([bt.buffer!], 'spike.mp4', { type: 'video/mp4' })
    } else {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry('spike.mp4').catch(() => undefined)
        const handle = await root.getFileHandle('spike.mp4', { create: true })
        const writable = await handle.createWritable()
        let writes = 0
        let bytes = 0
        const sink = new WritableStream<StreamTargetChunk>({
            write: async (c) => {
                writes++
                bytes += c.data.byteLength
                await writable.write({ type: 'write', position: c.position, data: c.data })
            },
            close: async () => {
                await writable.close()
                log(`OPFS closed after ${writes} writes, ${(bytes / 1e6).toFixed(1)} MB`)
            },
        })
        target = new StreamTarget(sink, { chunked: true })
        readOutput = async () => {
            const f = await handle.getFile()
            return new File([f], 'spike.mp4', { type: 'video/mp4' })
        }
    }
    const output = new Output({ format: new Mp4OutputFormat(), target })
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
    // Spread 10 cuts evenly across the file (cuts are up to 14 s, shorter for short files)
    const duration = await input.computeDuration()
    const lastV = await vSink.getPacket(Infinity)
    const fileEnd = lastV ? lastV.timestamp + lastV.duration : duration
    const cutLen = Math.min(14, duration / 12)
    log(`file duration ${duration.toFixed(1)} s → 10 cuts of ~${cutLen.toFixed(1)} s`)
    for (let i = 0; i < 10; i++) {
        const start = (duration * (i + 0.5)) / 10
        const end = Math.min(start + cutLen, fileEnd)
        const k0 = await vSink.getKeyPacket(start)
        const kEnd = await vSink.getKeyPacket(end)
        if (!k0) break
        const kStop = kEnd && kEnd.timestamp > k0.timestamp ? await vSink.getNextKeyPacket(kEnd) : await vSink.getNextKeyPacket(k0)
        const cutStart = k0.timestamp
        const cutEnd = kStop ? kStop.timestamp : fileEnd
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
    const out = await readOutput()
    const peakHeap = stopHeap()
    log(`peak JS heap: ${(peakHeap / 1e6).toFixed(1)} MB`)
    log(`done: ${(out.size / 1e6).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(1)} s`)

    // Read the output back to see what was actually written
    const check = new Input({ source: new BlobSource(out), formats: ALL_FORMATS })
    const cv = await check.getPrimaryVideoTrack()
    const ca = await check.getPrimaryAudioTrack()
    let vPackets = 0
    let lastTs = 0
    if (cv) for await (const p of new EncodedPacketSink(cv).packets()) { vPackets++; lastTs = p.timestamp }
    log(`readback: duration ${(await check.computeDuration()).toFixed(2)} s, video packets ${vPackets}, last video ts ${lastTs.toFixed(2)} s, audio ${ca ? 'yes' : 'no'}`)
    check.dispose()

    lastOutput = out
    ;(document.getElementById('share') as HTMLButtonElement).hidden = false
    ;(document.getElementById('out') as HTMLVideoElement).src = URL.createObjectURL(out)
}

document.getElementById('share')!.addEventListener('click', () => {
    if (!lastOutput) return
    if (navigator.canShare?.({ files: [lastOutput] })) {
        navigator.share({ files: [lastOutput], title: 'spike.mp4' }).catch((e: unknown) => log(`share failed: ${String(e)}`))
    } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(lastOutput)
        a.download = 'spike.mp4'
        a.click()
    }
})

document.getElementById('go')!.addEventListener('click', () => {
    const f = (document.getElementById('file') as HTMLInputElement).files?.[0]
    if (f) run(f).catch((e: unknown) => log(`ERROR: ${e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e)}`))
})

// Raw sequential read speed of the picked file, in 8 MB and 256 KB chunks (first 200 MB)
document.getElementById('speed')!.addEventListener('click', async () => {
    const f = (document.getElementById('file') as HTMLInputElement).files?.[0]
    if (!f) { log('Read speed: pick a file first'); return }
    log(`Read speed: testing ${f.name} (up to 20 s per pass)…`)
    for (const chunk of [8 * 1024 * 1024, 256 * 1024]) {
        const limit = Math.min(f.size, 200 * 1024 * 1024)
        const offset = Math.floor(f.size / 3)
        const t0 = performance.now()
        let read = 0
        while (read < limit && offset + read < f.size) {
            const buf = await f.slice(offset + read, offset + read + chunk).arrayBuffer()
            read += buf.byteLength
            if ((performance.now() - t0) > 20000) break
        }
        const s = (performance.now() - t0) / 1000
        log(`read ${chunk >= 1048576 ? chunk / 1048576 + ' MB' : chunk / 1024 + ' KB'} chunks: ${(read / 1e6).toFixed(0)} MB in ${s.toFixed(1)} s = ${(read / 1e6 / s).toFixed(1)} MB/s`)
    }
})
