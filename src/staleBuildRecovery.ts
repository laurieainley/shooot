import { isStaleChunkError, shouldReload } from './utils/staleBuild'

const KEY = 'shooot-stale-reload-at'

function lastReload(): number | null {
    try {
        const v = sessionStorage.getItem(KEY)
        return v ? Number(v) : null
    } catch {
        return null
    }
}

/** Reloads once to pick up the new deploy. Events and settings are persisted, so nothing is lost but the file links. */
export function reloadForNewVersion(): boolean {
    const now = Date.now()
    if (!shouldReload(lastReload(), now)) return false
    try { sessionStorage.setItem(KEY, String(now)) } catch { /* private mode: still reload once */ }
    window.location.reload()
    return true
}

export function recoverFromStaleChunk(err: unknown): boolean {
    return isStaleChunkError(err) && reloadForNewVersion()
}

/** Vite fires `vite:preloadError` when a lazy chunk can't be loaded; also warm the render engine early. */
export function installStaleBuildRecovery(): void {
    window.addEventListener('vite:preloadError', (event) => {
        if (reloadForNewVersion()) event.preventDefault()
    })
    const warm = (): void => { void import('./render').catch(() => undefined) }
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 5000 })
    else setTimeout(warm, 2000)
}
