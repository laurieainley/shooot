import { useEffect, useRef, useState } from 'react'
import { SYNTHETIC, makeSyntheticClip } from './synthetic'
import { STAGES, cleanUp, probeFile, type BenchSource } from './stages'
import { collectDevice } from './deviceInfo'
import { formatResult, summaryText, type BenchReport, type StageId, type StageResult } from './results'
import { VIDEO_BITRATE } from '../utils/outputQuality'

const SAFE: Record<StageId, boolean> = { probe: true, copy: true, highlights: true, reencode1080: true, reencode4k: true, graphics: true }

/** On-device benchmark of the export pipelines (not linked from the editor). */
export function BenchPage() {
    const [device, setDevice] = useState<Record<string, unknown> | null>(null)
    const [files, setFiles] = useState<BenchSource[]>([])
    const [synth, setSynth] = useState<boolean[]>(SYNTHETIC.map(() => false))
    const [picked, setPicked] = useState<Record<StageId, boolean>>(SAFE)
    const [graphicsInReencode, setGraphicsInReencode] = useState(true)
    const [forceCanvas, setForceCanvas] = useState(false)
    const [keep, setKeep] = useState(false)
    const [bitrate4k, setBitrate4k] = useState(String(VIDEO_BITRATE['4k'] / 1e6))
    const [bitrate1080, setBitrate1080] = useState(String(VIDEO_BITRATE['1080p'] / 1e6))
    const [running, setRunning] = useState(false)
    const [status, setStatus] = useState('')
    const [fraction, setFraction] = useState(0)
    const [results, setResults] = useState<StageResult[]>([])
    const [kept, setKept] = useState<{ url: string; name: string } | null>(null)
    const [copied, setCopied] = useState('')
    const abort = useRef<AbortController | null>(null)
    const lock = useRef<WakeLockSentinel | null>(null)
    const startedAt = useRef(new Date().toISOString())

    useEffect(() => { void collectDevice().then(setDevice) }, [])

    const acquire = async (): Promise<void> => { try { lock.current = await navigator.wakeLock?.request('screen') ?? null } catch { lock.current = null } }
    useEffect(() => {
        const again = (): void => { if (running && document.visibilityState === 'visible') void acquire() }
        document.addEventListener('visibilitychange', again)
        return () => document.removeEventListener('visibilitychange', again)
    }, [running])

    const report = (): BenchReport => ({ startedAt: startedAt.current, page: location.href, device: device ?? {}, results })

    const run = async (): Promise<void> => {
        const ctrl = new AbortController()
        abort.current = ctrl
        setRunning(true)
        setResults([])
        setKept(null)
        startedAt.current = new Date().toISOString()
        await acquire()
        const sources: BenchSource[] = [...files]
        try {
            for (const [i, on] of synth.entries()) {
                if (!on) continue
                setStatus(`Making ${SYNTHETIC[i].label}…`)
                try {
                    const f = await makeSyntheticClip(SYNTHETIC[i], (p) => setFraction(p))
                    sources.push({ name: SYNTHETIC[i].label, file: f })
                } catch (e) {
                    setResults((r) => [...r, { stage: 'probe', label: 'Make synthetic clip', source: SYNTHETIC[i].label, status: 'failed', error: { message: e instanceof Error ? e.message : String(e), ...(e instanceof Error && e.stack ? { stack: e.stack } : {}) } }])
                }
            }
            for (const source of sources) {
                let probe
                try { probe = await probeFile(source.file) } catch (e) {
                    setResults((r) => [...r, { stage: 'probe', label: 'Probe / demux', source: source.name, status: 'failed', error: { message: e instanceof Error ? e.message : String(e), ...(e instanceof Error && e.stack ? { stack: e.stack } : {}) } }])
                    continue
                }
                for (const def of STAGES) {
                    if (!picked[def.id] || ctrl.signal.aborted) continue
                    setStatus(`${def.label} · ${source.name}`)
                    setFraction(0)
                    const res = await def.run({
                        source, includeGraphics: graphicsInReencode, forceCanvas, signal: ctrl.signal,
                        bitrates: { '4k': Number(bitrate4k) * 1e6, '1080p': Number(bitrate1080) * 1e6 },
                        onProgress: (f, t) => { setFraction(f); if (t) setStatus(`${def.label} · ${source.name} · ${t}`) },
                    }, probe)
                    setResults((r) => [...r, res])
                    if (res.status !== 'skipped' && keep) {
                        // The latest output stays so it can be downloaded; the next render clears it.
                        try {
                            const root = await navigator.storage.getDirectory()
                            const f = await (await root.getFileHandle('bench-output.mp4')).getFile()
                            setKept((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(f), name: `bench-${def.id}.mp4` } })
                        } catch { /* nothing kept */ }
                    }
                    if (!keep) await cleanUp()
                }
            }
        } finally {
            setStatus(ctrl.signal.aborted ? 'Stopped' : 'Finished')
            setRunning(false)
            await lock.current?.release().catch(() => undefined)
            lock.current = null
        }
    }

    const copy = async (): Promise<void> => {
        try { await navigator.clipboard.writeText(JSON.stringify(report(), null, 2)); setCopied('Copied') } catch { setCopied('Copy failed: select the text below') }
    }
    const share = async (): Promise<void> => {
        try { await navigator.share({ title: 'Shooot bench', text: summaryText(report()) }) } catch (e) { setCopied(e instanceof Error ? e.message : 'Share failed') }
    }

    const total = files.length + synth.filter(Boolean).length

    return (
        <main className="bench">
            <h1>Shooot bench</h1>
            <p className="warn">Keep the screen on and this tab in front while it runs. Nothing is uploaded: the files stay on this device and the outputs are deleted afterwards.</p>

            <section>
                <h2>This device</h2>
                <pre>{device ? JSON.stringify(device, null, 1) : 'Checking…'}</pre>
            </section>

            <section>
                <h2>Footage</h2>
                <input type="file" multiple onChange={(e) => setFiles([...(e.target.files ?? [])].map((f) => ({ name: f.name, file: f })))} />
                {SYNTHETIC.map((s, i) => (
                    <label key={s.label} className="row"><input type="checkbox" checked={synth[i]} onChange={(e) => setSynth(synth.map((v, k) => (k === i ? e.target.checked : v)))} /> {s.label} (made in the browser)</label>
                ))}
            </section>

            <section>
                <h2>Stages</h2>
                {STAGES.map((s) => (
                    <label key={s.id} className="row"><input type="checkbox" checked={picked[s.id]} onChange={(e) => setPicked({ ...picked, [s.id]: e.target.checked })} /> <span>{s.label}<span className="small"> {s.hint}</span></span></label>
                ))}
                <label className="row"><input type="checkbox" checked={graphicsInReencode} onChange={(e) => setGraphicsInReencode(e.target.checked)} /> Cards, captions, score bug and replays in the re-encode stages</label>
                <label className="row"><input type="checkbox" checked={forceCanvas} onChange={(e) => setForceCanvas(e.target.checked)} /> Always draw through the canvas (no direct frame pass)</label>
                <label className="row"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the latest output so I can download it</label>
                <label className="row">4K Mbps <input className="field" inputMode="decimal" style={{ width: 80 }} value={bitrate4k} onChange={(e) => setBitrate4k(e.target.value)} /> 1080p Mbps <input className="field" inputMode="decimal" style={{ width: 80 }} value={bitrate1080} onChange={(e) => setBitrate1080(e.target.value)} /></label>
                <div className="buttons">
                    <button type="button" className="btn-primary" disabled={running || total === 0} onClick={() => void run()}>Run {total > 0 ? `on ${total} clip${total === 1 ? '' : 's'}` : ''}</button>
                    {running && <button type="button" className="btn-quiet" onClick={() => abort.current?.abort()}>Stop</button>}
                </div>
                {(running || status) && <p className="small" role="status">{status}</p>}
                {running && <div className="bar"><i style={{ width: `${Math.round(fraction * 100)}%` }} /></div>}
            </section>

            <section>
                <h2>Results</h2>
                {results.length === 0 && <p className="small">Nothing yet.</p>}
                {results.map((r, i) => (
                    <div key={i} className={`result ${r.status === 'failed' ? 'failed' : ''}`}>
                        <b>{formatResult(r)}</b>
                        {r.encoder && <pre>{JSON.stringify({ hw: r.encoder.hardwareAcceleration, codec: r.encoder.codec, bitrate: r.encoder.bitrate }, null, 0)}</pre>}
                        {r.error?.stack && <pre>{r.error.stack}</pre>}
                    </div>
                ))}
                <div className="buttons">
                    <button type="button" className="btn-quiet" disabled={results.length === 0} onClick={() => void copy()}>Copy results</button>
                    {typeof navigator.share === 'function' && <button type="button" className="btn-quiet" disabled={results.length === 0} onClick={() => void share()}>Share</button>}
                    {kept && <a className="btn-quiet" href={kept.url} download={kept.name}>Download last output</a>}
                    <button type="button" className="btn-quiet" disabled={running} onClick={() => { void cleanUp(); setKept(null) }}>Clean up storage</button>
                </div>
                {copied && <p className="small">{copied}</p>}
                {results.length > 0 && <pre>{JSON.stringify(report(), null, 1)}</pre>}
            </section>
        </main>
    )
}
