import { prepareSpec } from '../graphics/prepare'
import { graphicsSupport } from '../utils/capabilities'
import type { ExportPlan } from '../utils/exportPlans'
import type { JobKind } from '../render/renderJob'
import type { ReuseKeys } from '../render/unitCache'
import { renderJobs, type RenderRequest } from '../renderJobs'
import { buildReuseKeys, logoFingerprint } from '../render/unitCache'
import { loadCustomLogo } from '../graphics/logoStore'
import { askNotifyPermission } from './notify'
import { pickSaveFile } from '../utils/savePicker'

/** Prepares a plan's graphics and turns it into a render request; a graphics problem only costs the graphics. */
/** With `targetFile` the render is not resumable and reuses no parts (both stage their data in browser storage): it streams into the file. */
export async function requestFor(plan: ExportPlan, onGraphicsError: (reason: string) => void, targetFile?: FileSystemFileHandle): Promise<RenderRequest> {
    // No WebCodecs (older Safari): skip the graphics up front with a clear reason; the plain reel is stream-copied.
    const support = graphicsSupport(globalThis as unknown as Record<string, unknown>)
    if (!support.ok && plan.spec) onGraphicsError(support.message ?? 'graphics are not available in this browser')
    const graphics = support.ok ? await prepareSpec(plan.spec).catch((e: unknown) => {
        onGraphicsError(e instanceof Error ? e.message : String(e))
        return undefined
    }) : undefined
    // Re-encodes keep their finished parts, so the next export after a small edit only encodes what changed.
    const reuse = !targetFile && plan.output && plan.resumable && plan.kind !== 'clip' ? await reuseKeysFor(plan) : undefined
    return {
        cuts: plan.cuts, sources: plan.sources, outputName: plan.outputName, signature: plan.signature,
        ...(graphics ? { graphics } : {}),
        ...(plan.output ? { output: plan.output } : {}),
        ...(reuse ? { reuse } : {}),
        ...(targetFile ? { targetFile } : {}),
        ...(!targetFile && plan.resumable && plan.kind !== 'clip' ? { resumable: { signature: plan.signature, kind: plan.kind } } : {}),
    }
}

/** The unit cache's keys for a re-encode plan (also what the Export panel's estimate asks the cache about). */
export async function reuseKeysFor(plan: ExportPlan): Promise<ReuseKeys | undefined> {
    if (!plan.output || plan.kind === 'clip') return undefined
    return buildReuseKeys({
        which: plan.kind, cuts: plan.cuts, sources: plan.sources, spec: plan.spec,
        quality: plan.output.quality, videoBitrate: plan.output.videoBitrate, logo: await logoFingerprint(await loadCustomLogo()),
    })
}

/** Starts the plan's render in the app's render manager (asks for notification permission first on long renders). */
export function startExport(kind: JobKind, quality: 'full' | 'preview', plan: ExportPlan, long: boolean, targetFile?: FileSystemFileHandle): void {
    if (long) askNotifyPermission() // inside the click
    const jobs = renderJobs().getState()
    void jobs.start({ kind, quality, output: plan.output?.quality ?? 'original' }, () => requestFor(plan, (reason) => jobs.setReport({ applied: [], skipped: [{ label: 'Graphics', reason }] }), targetFile))
}

/** "Save to file…": asks where to save (call it inside the click), then renders straight into that file. Does nothing if the picker is cancelled. */
export async function saveExportToFile(kind: JobKind, plan: ExportPlan, long: boolean): Promise<void> {
    let handle: FileSystemFileHandle | null
    try {
        handle = await pickSaveFile(plan.outputName)
    } catch (e) {
        // The picker itself failed (not cancelled): end as a Failed export with the reason, not silently.
        void renderJobs().getState().start({ kind, quality: 'full', output: plan.output?.quality ?? 'original' }, async () => { throw new Error(`Could not open the save dialog: ${e instanceof Error ? e.message : String(e)}`) })
        return
    }
    if (handle) startExport(kind, 'full', plan, long, handle)
}
