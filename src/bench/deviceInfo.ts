import { encodeSupportMatrix } from './stages'

export async function collectDevice(): Promise<Record<string, unknown>> {
    const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string; brands?: unknown } }
    let storage: Record<string, unknown> = {}
    try {
        const e = await navigator.storage.estimate()
        storage = { quotaGB: e.quota ? +(e.quota / 1e9).toFixed(2) : null, usageGB: e.usage ? +(e.usage / 1e9).toFixed(3) : null }
    } catch { storage = { error: 'storage.estimate unavailable' } }
    let opfs = false
    try { await navigator.storage.getDirectory(); opfs = true } catch { /* none */ }
    return {
        userAgent: nav.userAgent, platform: nav.userAgentData?.platform ?? nav.platform, hardwareConcurrency: nav.hardwareConcurrency,
        deviceMemoryGB: nav.deviceMemory ?? null, storage, opfs, wakeLock: 'wakeLock' in navigator,
        webCodecs: { VideoEncoder: typeof VideoEncoder !== 'undefined', VideoDecoder: typeof VideoDecoder !== 'undefined', AudioEncoder: typeof AudioEncoder !== 'undefined', AudioDecoder: typeof AudioDecoder !== 'undefined' },
        support: await encodeSupportMatrix(),
    }
}
