import { prepareSpec } from '../graphics/prepare'
import { graphicsSupport } from '../utils/capabilities'
import type { ExportPlan } from '../utils/exportPlans'
import type { JobKind } from '../render/renderJob'
import type { ReuseKeys } from '../render/unitCache'
import { renderJobs, type RenderRequest } from '../renderJobs'
import { buildReuseKeys, logoFingerprint } from '../render/unitCache'
import { loadCustomLogo } from '../graphics/logoStore'
import { askNotifyPermission } from './notify'

/** Prepares a plan's graphics and turns it into a render request; a graphics problem only costs the graphics. */
export async function requestFor(plan: ExportPlan, onGraphicsError: (reason: string) => void): Promise<RenderRequest> {
    // No WebCodecs (older Safari): skip the graphics up front with a clear reason; the plain reel is stream-copied.
    const support = graphicsSupport(globalThis as unknown as Record<string, unknown>)
    if (!support.ok && plan.spec) onGraphicsError(support.message ?? 'graphics are not available in this browser')
    const graphics = support.ok ? await prepareSpec(plan.spec).catch((e: unknown) => {
        onGraphicsError(e instanceof Error ? e.message : String(e))
        return undefined
    }) : undefined
    // Re-encodes keep their finished parts, so the next export after a small edit only encodes what changed.
    const reuse = plan.output && plan.resumable && plan.kind !== 'clip' ? await reuseKeysFor(plan) : undefined
    return {
        cuts: plan.cuts, sources: plan.sources, outputName: plan.outputName, signature: plan.signature,
        ...(graphics ? { graphics } : {}),
        ...(plan.output ? { output: plan.output } : {}),
        ...(reuse ? { reuse } : {}),
        ...(plan.resumable && plan.kind !== 'clip' ? { resumable: { signature: plan.signature, kind: plan.kind } } : {}),
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
export function startExport(kind: JobKind, quality: 'full' | 'preview', plan: ExportPlan, long: boolean): void {
    if (long) askNotifyPermission() // inside the click
    const jobs = renderJobs().getState()
    void jobs.start({ kind, quality, output: plan.output?.quality ?? 'original' }, () => requestFor(plan, (reason) => jobs.setReport({ applied: [], skipped: [{ label: 'Graphics', reason }] })))
}
