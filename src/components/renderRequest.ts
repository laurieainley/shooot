import { prepareSpec } from '../graphics/prepare'
import { graphicsSupport } from '../utils/capabilities'
import type { ExportPlan } from '../utils/exportPlans'
import { renderJobs, type RenderRequest } from '../renderJobs'
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
    return {
        cuts: plan.cuts, sources: plan.sources, outputName: plan.outputName,
        ...(graphics ? { graphics } : {}),
        ...(plan.resumable ? { resumable: { signature: plan.signature, kind: plan.outputName.startsWith('full-match') ? 'fullMatch' as const : 'highlights' as const } } : {}),
        ...(plan.reencodeAll ? { reencodeSec: plan.seconds } : {}),
    }
}

/** Starts the plan's render in the app's render manager (asks for notification permission first on long renders). */
export function startExport(kind: 'highlights' | 'fullMatch', quality: 'full' | 'preview', plan: ExportPlan, long: boolean): void {
    if (long) askNotifyPermission() // inside the click
    const jobs = renderJobs().getState()
    void jobs.start({ kind, quality }, () => requestFor(plan, (reason) => jobs.setReport({ applied: [], skipped: [{ label: 'Graphics', reason }] })))
}
