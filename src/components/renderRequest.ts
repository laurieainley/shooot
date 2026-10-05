import { prepareSpec } from '../graphics/prepare'
import type { ExportPlan } from '../utils/exportPlans'
import type { RenderRequest } from './useRenderRunner'

/** Prepares a plan's graphics and turns it into a render request; a graphics problem only costs the graphics. */
export async function requestFor(plan: ExportPlan, onGraphicsError: (reason: string) => void): Promise<RenderRequest> {
    const graphics = await prepareSpec(plan.spec).catch((e: unknown) => {
        onGraphicsError(e instanceof Error ? e.message : String(e))
        return undefined
    })
    return {
        cuts: plan.cuts, sources: plan.sources, outputName: plan.outputName,
        ...(graphics ? { graphics } : {}),
        ...(plan.resumable ? { resumable: { signature: plan.signature, kind: plan.outputName.startsWith('full-match') ? 'fullMatch' as const : 'highlights' as const } } : {}),
        ...(plan.reencodeAll ? { reencodeSec: plan.seconds } : {}),
    }
}
