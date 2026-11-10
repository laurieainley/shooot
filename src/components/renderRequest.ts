import { prepareSpec } from '../graphics/prepare'
import { isSavingParts } from '../prepare/partsSave'
import { graphicsSupport } from '../utils/capabilities'
import type { ExportPlan } from '../utils/exportPlans'
import type { JobKind } from '../render/renderJob'
import type { ReuseKeys } from '../render/unitCache'
import { renderJobs, type FinishInfo, type RenderRequest } from '../renderJobs'
import { useAppState } from '../state'
import { estimatePlanTime, sourceFactsFor } from '../utils/exportPlans'
import { detectDeviceClass } from '../utils/renderTime'
import { appendRecord, buildExportRecord, sec1 } from '../exportLog'
import { holdPreparer, preparerTotals } from '../prepare/control'
import { takeBaseline } from '../prepare/baseline'
import { buildReuseKeys, footageFingerprint, logoFingerprint } from '../render/unitCache'
import { loadCustomLogo } from '../graphics/logoStore'
import { askNotifyPermission } from './notify'
import { pickSaveFile } from '../utils/savePicker'

/**
 * Prepares a plan's graphics and turns it into a render request; a graphics problem only costs the graphics.
 * With `targetFile` the render is not resumable (a journal stages its data in browser storage): it streams into the file, reading parts the cache holds
 * but keeping none. `withoutPrepared`: the unit cache is off (the comparison baseline).
 */
export async function requestFor(plan: ExportPlan, onGraphicsError: (reason: string) => void, targetFile?: FileSystemFileHandle, withoutPrepared = false): Promise<RenderRequest> {
    // No WebCodecs (older Safari): skip the graphics up front with a clear reason; the plain reel is stream-copied.
    const support = graphicsSupport(globalThis as unknown as Record<string, unknown>)
    if (!support.ok && plan.spec) onGraphicsError(support.message ?? 'graphics are not available in this browser')
    const graphics = support.ok ? await prepareSpec(plan.spec).catch((e: unknown) => {
        onGraphicsError(e instanceof Error ? e.message : String(e))
        return undefined
    }) : undefined
    // Re-encodes keep their finished parts, so the next export after a small edit only encodes what changed.
    const reuse = !withoutPrepared && plan.output && plan.resumable && plan.kind !== 'clip' ? await reuseKeysFor(plan) : undefined
    return {
        cuts: plan.cuts, sources: plan.sources, outputName: plan.outputName, signature: plan.signature,
        ...(graphics ? { graphics } : {}),
        ...(plan.output ? { output: plan.output } : {}),
        ...(reuse ? { reuse } : {}),
        ...(targetFile ? { targetFile } : {}),
        ...(withoutPrepared ? { withoutPrepared } : {}),
        ...(!targetFile && plan.resumable && plan.kind !== 'clip' ? { resumable: { signature: plan.signature, kind: plan.kind } } : {}),
    }
}

/**
 * The unit cache's keys for a re-encode plan (also what the Export panel's estimate asks the cache about). Each source's content print (read once per
 * file in a session) gives the keys their portable half, so parts prepared on another device are found; a file that cannot be read just has none.
 */
export async function reuseKeysFor(plan: ExportPlan): Promise<ReuseKeys | undefined> {
    if (!plan.output || plan.kind === 'clip') return undefined
    const fingerprints = await Promise.all(plan.sources.map((s) => footageFingerprint(s.file).catch(() => null)))
    return buildReuseKeys({
        which: plan.kind, cuts: plan.cuts, sources: plan.sources, spec: plan.spec,
        quality: plan.output.quality, videoBitrate: plan.output.videoBitrate, logo: await logoFingerprint(await loadCustomLogo()), fingerprints,
    })
}

/**
 * Starts the plan's render in the app's render manager (asks for notification permission first on long renders).
 * The background preparer stops from the click and the render waits until it has; `withoutPrepared` runs with the unit cache off (the comparison baseline).
 */
export function startExport(kind: JobKind, quality: 'full' | 'preview', plan: ExportPlan, long: boolean, targetFile?: FileSystemFileHandle, withoutPrepared = false): void {
    if (isSavingParts()) return // the parts file being written points at the cache's own parts (the buttons are disabled meanwhile)
    if (long) askNotifyPermission() // inside the click
    const jobs = renderJobs().getState()
    const hold = holdPreparer()
    withoutPrepared = takeBaseline() || withoutPrepared
    const output = plan.output?.quality ?? 'original'
    void jobs.start({ kind, quality, output }, async () => {
        await hold.idle
        const req = await requestFor(plan, (reason) => jobs.setReport({ applied: [], skipped: [{ label: 'Graphics', reason }] }), targetFile, withoutPrepared)
        return { ...req, onFinish: (end) => logExport(plan, !!targetFile, withoutPrepared, end) }
    }).finally(hold.release)
}

/** Appends this export to the timing log (never throws). */
function logExport(plan: ExportPlan, toFile: boolean, withoutPrepared: boolean, end: FinishInfo): void {
    try {
        const s = useAppState.getState()
        const out = plan.output?.quality ?? 'original'
        let model: { low: number; high: number } | null = null
        if (plan.output) { const e = estimatePlanTime(plan, out, sourceFactsFor(s.files, null), null); model = { low: e.low, high: e.high } }
        const prepare = plan.kind === 'clip' ? null : preparerTotals(plan.kind)
        void appendRecord(buildExportRecord({
            now: new Date(), project: s.matchdayLabel?.trim() || (s.teams.length >= 2 ? `${s.teams[0].name} v ${s.teams[1].name}` : null), kind: plan.kind,
            quality: out, outputSec: plan.seconds, device: detectDeviceClass(), save: toFile ? 'file' : 'download', withoutPrepared, end, model,
            prepare: prepare ? { wallSec: sec1(prepare.wallMs), unitsEncoded: prepare.unitsEncoded, encodedSec: Math.round(prepare.encodedSec * 10) / 10, pausedSec: sec1(prepare.pausedMs), throttledSec: sec1(prepare.throttledMs) } : null,
        }))
    } catch { /* the log never gets in the way */ }
}

/** "Save to file…": asks where to save (call it inside the click), then renders straight into that file. Does nothing if the picker is cancelled. */
export async function saveExportToFile(kind: JobKind, plan: ExportPlan, long: boolean, withoutPrepared = false): Promise<void> {
    let handle: FileSystemFileHandle | null
    try {
        handle = await pickSaveFile(plan.outputName)
    } catch (e) {
        // The picker itself failed (not cancelled): end as a Failed export with the reason, not silently.
        void renderJobs().getState().start({ kind, quality: 'full', output: plan.output?.quality ?? 'original' }, async () => { throw new Error(`Could not open the save dialog: ${e instanceof Error ? e.message : String(e)}`) })
        return
    }
    if (handle) startExport(kind, 'full', plan, long, handle, withoutPrepared)
}
