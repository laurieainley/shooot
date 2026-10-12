import { useEffect, useMemo, useRef, useState } from 'react'
import { SYNTHETIC, makeSyntheticClip } from './synthetic'
import { STAGES, cleanUp, probeFile, type BenchSource, type Probe } from './stages'
import { collectDevice } from './deviceInfo'
import { experimentRows, formatResult, summaryText, type BenchReport, type ExperimentId, type ExperimentResult, type StageId, type StageResult } from './results'
import { EXPERIMENTS, EXPERIMENT_MINUTES, runExperiment, warmUp } from './experiments'
import { clearKept } from './expCommon'
import { hasSavePicker } from './experiments/directSave'
import { ALL_EXPERIMENTS, PRESETS, detectPreset, type PresetId } from './presets'
import { VIDEO_BITRATE } from '../utils/outputQuality'

const SAFE: Record<StageId, boolean> = { probe: true, copy: true, highlights: true, reencode1080: true, reencode4k: true, graphics: true }
const NO_STAGES: Record<StageId, boolean> = { probe: false, copy: false, highlights: false, reencode1080: false, reencode4k: false, graphics: false }
const NO_EXPERIMENTS: Record<ExperimentId, boolean> = Object.fromEntries(ALL_EXPERIMENTS.map((e) => [e, false])) as Record<ExperimentId, boolean>

const errorOf = (e: unknown): { message: string; stack?: string } => ({ message: e instanceof Error ? e.message : String(e), ...(e instanceof Error && e.stack ? { stack: e.stack } : {}) })

/** On-device benchmark of the export pipelines (not linked from the editor). */
export function BenchPage() {
    const [device, setDevice] = useState<Record<string, unknown> | null>(null)
    const [files, setFiles] = useState<BenchSource[]>([])
    const [synth, setSynth] = useState<boolean[]>(SYNTHETIC.map(() => false))
    const [picked, setPicked] = useState<Record<StageId, boolean>>(SAFE)
    const [exps, setExps] = useState<Record<ExperimentId, boolean>>(NO_EXPERIMENTS)
    const [excerpt, setExcerpt] = useState('45')
    const [graphicsInReencode, setGraphicsInReencode] = useState(true)
    const [forceCanvas, setForceCanvas] = useState(false)
    const [keep, setKeep] = useState(false)
    const [deliver, setDeliver] = useState(true)
    const [realDownload, setRealDownload] = useState(false)
    const [bitrate4k, setBitrate4k] = useState(String(VIDEO_BITRATE['4k'] / 1e6))
    const [bitrate1080, setBitrate1080] = useState(String(VIDEO_BITRATE['1080p'] / 1e6))
    const [preset, setPreset] = useState<PresetId | null>(null)
    const [expSource, setExpSource] = useState(0)
    const [running, setRunning] = useState(false)
    const [status, setStatus] = useState('')
    const [fraction, setFraction] = useState(0)
    const [results, setResults] = useState<StageResult[]>([])
    const [expResults, setExpResults] = useState<ExperimentResult[]>([])
    const [kept, setKept] = useState<{ url: string; name: string } | null>(null)
    const [artifacts, setArtifacts] = useState<{ url: string; name: string }[]>([])
    const [copied, setCopied] = useState('')
    const abort = useRef<AbortController | null>(null)
    const lock = useRef<WakeLockSentinel | null>(null)
    const video = useRef<HTMLVideoElement | null>(null)
    const startedAt = useRef(new Date().toISOString())

    useEffect(() => { void collectDevice().then(setDevice) }, [])
    const suggested = useMemo(() => detectPreset({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }), [])

    const acquire = async (): Promise<void> => { try { lock.current = await navigator.wakeLock?.request('screen') ?? null } catch { lock.current = null } }
    useEffect(() => {
        const again = (): void => { if (running && document.visibilityState === 'visible') void acquire() }
        document.addEventListener('visibilitychange', again)
        return () => document.removeEventListener('visibilitychange', again)
    }, [running])

    const report = (): BenchReport => ({ startedAt: startedAt.current, page: location.href, device: device ?? {}, results, experiments: expResults })

    const applyPreset = (id: PresetId): void => {
        const p = PRESETS[id]
        setPreset(id)
        setPicked({ ...NO_STAGES, ...Object.fromEntries(p.stages.map((s) => [s, true])) })
        setExps({ ...NO_EXPERIMENTS, ...Object.fromEntries(p.experiments.map((e) => [e, true])) })
        setDeliver(p.deliver)
        setGraphicsInReencode(true)
    }

    const run = async (opts: { stages: boolean; experiments: ExperimentId[] }): Promise<void> => {
        // Experiment 4 writes into a file the user picks: the picker needs this click, so it comes before anything slow.
        let saveHandle: FileSystemFileHandle | null = null
        if (opts.experiments.includes('directSave') && hasSavePicker()) {
            try {
                saveHandle = await (window as unknown as { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker({ suggestedName: 'shooot-bench-direct-save.mp4', types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] })
            } catch (e) { setCopied(`No output file chosen (${errorOf(e).message}): experiment 4 will only report the save-step cost.`) }
        }
        const ctrl = new AbortController()
        abort.current = ctrl
        setRunning(true)
        setResults([])
        setExpResults([])
        setKept(null)
        setArtifacts([])
        startedAt.current = new Date().toISOString()
        await acquire()
        await clearKept().catch(() => undefined)
        const sources: BenchSource[] = [...files]
        try {
            for (const [i, on] of synth.entries()) {
                if (!on) continue
                setStatus(`Making ${SYNTHETIC[i].label}…`)
                try {
                    const f = await makeSyntheticClip(SYNTHETIC[i], (p) => setFraction(p))
                    sources.push({ name: SYNTHETIC[i].label, file: f })
                } catch (e) {
                    setResults((r) => [...r, { stage: 'probe', label: 'Make synthetic clip', source: SYNTHETIC[i].label, status: 'failed', error: errorOf(e) }])
                }
            }
            const probes = new Map<BenchSource, Probe>()
            if (opts.stages) {
                for (const source of sources) {
                    let probe
                    try { probe = await probeFile(source.file); probes.set(source, probe) } catch (e) {
                        setResults((r) => [...r, { stage: 'probe', label: 'Probe / demux', source: source.name, status: 'failed', error: errorOf(e) }])
                        continue
                    }
                    for (const def of STAGES) {
                        if (!picked[def.id] || ctrl.signal.aborted) continue
                        setStatus(`${def.label} · ${source.name}`)
                        setFraction(0)
                        const res = await def.run({
                            source, includeGraphics: graphicsInReencode, forceCanvas, signal: ctrl.signal, deliver, realDownload,
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
            }
            if (opts.experiments.length > 0 && !ctrl.signal.aborted) {
                const source = sources[Math.min(expSource, sources.length - 1)]
                if (!source) setExpResults([{ id: opts.experiments[0], number: 0, name: 'Experiments', source: '-', excerptSec: 0, status: 'failed', rows: [], error: { message: 'No footage chosen' } }])
                else {
                    let probe = probes.get(source)
                    try { probe ??= await probeFile(source.file) } catch (e) {
                        setExpResults([{ id: opts.experiments[0], number: 0, name: 'Experiments', source: source.name, excerptSec: 0, status: 'failed', rows: [], error: errorOf(e) }])
                        probe = undefined
                    }
                    const chosen = EXPERIMENTS.filter((d) => opts.experiments.includes(d.id))
                    if (probe) {
                        setStatus('Warming up the encoder…')
                        await warmUp({ source, probe, excerptSec: 4, signal: ctrl.signal, saveHandle: null, video: null, realDownload: false, onProgress: () => undefined, addArtifact: () => undefined })
                    }
                    for (const [n, def] of chosen.entries()) {
                        if (!probe || ctrl.signal.aborted) break
                        const label = `Experiment ${n + 1} of ${chosen.length}: #${def.number} ${def.name}`
                        setStatus(label)
                        setFraction(0)
                        const res = await runExperiment(def, {
                            source, probe, excerptSec: Math.max(5, Number(excerpt) || 45), signal: ctrl.signal, saveHandle, video: video.current, realDownload,
                            onProgress: (f, t) => { setFraction(f); setStatus(t ? `${label} · ${t}` : label) },
                            addArtifact: (name, blob) => setArtifacts((a) => [...a.filter((x) => x.name !== name), { name, url: URL.createObjectURL(blob) }]),
                        })
                        setExpResults((r) => [...r, res])
                    }
                }
            }
        } finally {
            setStatus(ctrl.signal.aborted ? 'Stopped' : 'Finished')
            setRunning(false)
            await lock.current?.release().catch(() => undefined)
            lock.current = null
        }
    }

    const chosenExps = ALL_EXPERIMENTS.filter((e) => exps[e])
    const anyStage = STAGES.some((s) => picked[s.id])

    const copy = async (): Promise<void> => {
        try { await navigator.clipboard.writeText(JSON.stringify(report(), null, 2)); setCopied('Copied') } catch { setCopied('Copy failed: select the text below') }
    }
    const share = async (): Promise<void> => {
        try { await navigator.share({ title: 'Shooot bench', text: summaryText(report()) }) } catch (e) { setCopied(e instanceof Error ? e.message : 'Share failed') }
    }

    const total = files.length + synth.filter(Boolean).length
    const hot = new Set(preset ? PRESETS[preset].highlight : [])
    const table = experimentRows(expResults)

    return (
        <main className="bench">
            <h1>Shooot bench</h1>
            <p className="warn">Keep the screen on and this tab in front while it runs. Nothing is uploaded: the files stay on this device and the outputs are deleted afterwards.</p>

            <section>
                <h2>Quick start</h2>
                <div className="buttons">
                    {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                        <button key={id} type="button" className={`${preset === id ? 'btn-primary' : 'btn-quiet'}${suggested === id ? ' suggested' : ''}`} disabled={running} aria-pressed={preset === id} onClick={() => applyPreset(id)}>
                            {PRESETS[id].label}{suggested === id ? ' (this device?)' : ''}
                        </button>
                    ))}
                </div>
                <p className="small">{preset ? PRESETS[preset].instruction : 'Pick the device you are on: it ticks the stages and experiments to run. The boxes below stay editable.'}</p>
            </section>

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
                <label className="row"><input type="checkbox" checked={deliver} onChange={(e) => setDeliver(e.target.checked)} /> Time the save step after each stage ("deliver": wrap + read the whole output back through its URL)</label>
                <label className="row"><input type="checkbox" checked={realDownload} onChange={(e) => setRealDownload(e.target.checked)} /> ...and really start a download of each output (fills Downloads)</label>
                <label className="row"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the latest output so I can download it</label>
                <label className="row">4K Mbps <input className="field" inputMode="decimal" style={{ width: 80 }} value={bitrate4k} onChange={(e) => setBitrate4k(e.target.value)} /> 1080p Mbps <input className="field" inputMode="decimal" style={{ width: 80 }} value={bitrate1080} onChange={(e) => setBitrate1080(e.target.value)} /></label>
            </section>

            <section>
                <h2>Experiments <span className="small">(experimental)</span></h2>
                <p className="small">Candidate speed-ups, each measured as a baseline/variant pair on the first seconds of ONE file. They are off in the stages above, so those numbers stay comparable with earlier runs.</p>
                {EXPERIMENTS.map((d) => (
                    <label key={d.id} className="row"><input type="checkbox" checked={exps[d.id]} onChange={(e) => setExps({ ...exps, [d.id]: e.target.checked })} /> <span>#{d.number} {d.name}<span className="small"> {d.hint}</span></span></label>
                ))}
                <label className="row">Excerpt length (s) <input className="field" inputMode="numeric" style={{ width: 80 }} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} /></label>
                {total > 1 && (
                    <label className="row">Use footage <select value={expSource} onChange={(e) => setExpSource(Number(e.target.value))}>{[...files.map((f) => f.name), ...SYNTHETIC.filter((_, i) => synth[i]).map((s) => s.label)].map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>
                )}
                {hasSavePicker() && exps.directSave && <p className="small">Experiment 4 will ask where to save a file when you press Start.</p>}
                <video ref={video} muted playsInline controls={false} style={{ width: 320, maxWidth: '100%', background: '#000', borderRadius: 6, display: exps.playback || running ? 'block' : 'none' }} />
                <div className="buttons">
                    <button type="button" className="btn-quiet" disabled={running || total === 0} onClick={() => { setExps(Object.fromEntries(ALL_EXPERIMENTS.map((e) => [e, true])) as Record<ExperimentId, boolean>); void run({ stages: false, experiments: ALL_EXPERIMENTS }) }}>Run all experiments (about {EXPERIMENT_MINUTES} min)</button>
                </div>
            </section>

            <section>
                <div className="buttons">
                    <button type="button" className="btn-primary" disabled={running || total === 0 || (!anyStage && chosenExps.length === 0)} onClick={() => void run({ stages: anyStage, experiments: chosenExps })}>Start{total > 0 ? ` on ${total} clip${total === 1 ? '' : 's'}` : ''}</button>
                    {running && <button type="button" className="btn-quiet" onClick={() => abort.current?.abort()}>Stop</button>}
                </div>
                {(running || status) && <p className="small" role="status">{status}</p>}
                {running && <div className="bar"><i style={{ width: `${Math.round(fraction * 100)}%` }} /></div>}
            </section>

            <section>
                <h2>Results</h2>
                {results.length === 0 && expResults.length === 0 && <p className="small">Nothing yet.</p>}
                {results.map((r, i) => (
                    <div key={i} className={`result ${r.status === 'failed' ? 'failed' : ''}`}>
                        <b>{formatResult(r)}</b>
                        {r.encoder && <pre>{JSON.stringify({ hw: r.encoder.hardwareAcceleration, codec: r.encoder.codec, bitrate: r.encoder.bitrate, scalePath: r.encoder.scalePath }, null, 0)}</pre>}
                        {r.deliver && <p className="small">Save step: {(r.deliver.readMs / 1000).toFixed(1)} s to read {(r.deliver.bytes / 1048576).toFixed(0)} MB back ({r.deliver.readMBps.toFixed(0)} MB/s), {r.deliver.prepareMs.toFixed(0)} ms to prepare{r.deliver.clickMs !== undefined ? `, ${r.deliver.clickMs.toFixed(0)} ms to click download` : ''}</p>}
                        {r.error?.stack && <pre>{r.error.stack}</pre>}
                    </div>
                ))}
                {expResults.length > 0 && (
                    <div className="table-wrap">
                        <h2>Experiments <span className="small">(experimental; speed-up % = time saved against the baseline)</span></h2>
                        <table className="exp-table">
                            <thead><tr><th>Experiment</th><th>Baseline</th><th>Variant</th><th>Speed-up</th><th>Output size</th><th>Error / note</th></tr></thead>
                            <tbody>
                                {table.map((row, i) => (
                                    <tr key={i} className={hot.has(expResults.find((e) => row[0].startsWith(`#${e.number} `))?.id as ExperimentId) ? 'hot' : ''}>{row.map((c, k) => <td key={k}>{c}</td>)}</tr>
                                ))}
                            </tbody>
                        </table>
                        {expResults.filter((e) => e.error).map((e) => <pre key={e.id} className="failed">{`#${e.number} ${e.name}: ${e.error?.stack ?? e.error?.message}`}</pre>)}
                    </div>
                )}
                <div className="buttons">
                    <button type="button" className="btn-quiet" disabled={results.length === 0 && expResults.length === 0} onClick={() => void copy()}>Copy results</button>
                    {typeof navigator.share === 'function' && <button type="button" className="btn-quiet" disabled={results.length === 0 && expResults.length === 0} onClick={() => void share()}>Share</button>}
                    {kept && <a className="btn-quiet" href={kept.url} download={kept.name}>Download last output</a>}
                    {artifacts.map((a) => <a key={a.name} className="btn-quiet" href={a.url} download={a.name}>Download {a.name}</a>)}
                    <button type="button" className="btn-quiet" disabled={running} onClick={() => { void cleanUp(); void clearKept(); setKept(null); setArtifacts([]) }}>Clean up storage</button>
                </div>
                {copied && <p className="small">{copied}</p>}
                {(results.length > 0 || expResults.length > 0) && <pre id="bench-report">{JSON.stringify(report(), null, 1)}</pre>}
            </section>
        </main>
    )
}
