import { useEffect, useState } from 'react'
import { reusableParts, type CacheKind, type ReusableParts } from '../render/unitCache'
import { planOutput, type ExportPlan } from '../utils/exportPlans'
import type { OutputQuality } from '../utils/outputQuality'
import { reuseKeysFor } from './renderRequest'

/** What the last export of this kind left in the cache for each re-encode quality (none while unknown); re-read when the plan changes or a render ends. */
export function useReusableParts(kind: CacheKind, plan: ExportPlan, busy: boolean): (q: OutputQuality) => ReusableParts | null {
    const [parts, setParts] = useState<Partial<Record<OutputQuality, ReusableParts>>>({})
    useEffect(() => {
        if (busy) return
        let live = true
        void (async () => {
            const next: Partial<Record<OutputQuality, ReusableParts>> = {}
            for (const q of ['4k', '1080p'] as const) {
                const keys = await reuseKeysFor({ ...plan, output: planOutput(q) })
                if (keys) next[q] = await reusableParts(kind, keys, plan.cuts.length)
            }
            if (live) setParts(next)
        })().catch(() => undefined)
        return () => { live = false }
    }, [kind, plan, busy])
    return (q) => parts[q] ?? null
}
