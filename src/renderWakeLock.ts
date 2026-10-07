// Keeps the screen awake while a render runs, and takes the lock again when the tab comes back (the browser drops it
// when the page is hidden). Best effort: unsupported or denied is fine, the render goes on.

type Sentinel = EventTarget & { release: () => Promise<void> }
type NavWithWakeLock = { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } }
type Doc = EventTarget & { visibilityState: string }

export type RenderWakeLock = {
    acquire: () => Promise<void>
    release: () => Promise<void>
    /** Plain-text outcome for the render diagnostics. */
    status: () => string
}

export function createRenderWakeLock(nav: NavWithWakeLock | undefined = typeof navigator === 'undefined' ? undefined : navigator as NavWithWakeLock, doc: Doc | undefined = typeof document === 'undefined' ? undefined : document): RenderWakeLock {
    let sentinel: Sentinel | null = null
    let wanted = false
    let state = 'not requested'
    let reacquired = 0
    let requesting = false

    const request = async (): Promise<void> => {
        if (!nav?.wakeLock) { state = 'unsupported'; return }
        if (requesting || sentinel) return
        requesting = true
        try {
            const s = await nav.wakeLock.request('screen')
            if (!wanted) { void s.release().catch(() => {}); return }
            sentinel = s
            s.addEventListener('release', () => { if (sentinel === s) { sentinel = null; if (wanted) state = 'dropped by the browser' } })
            state = 'held'
        } catch (e) {
            state = `denied (${e instanceof Error ? e.name : 'error'})`
        } finally {
            requesting = false
        }
    }
    const onVisible = (): void => {
        if (!wanted || doc?.visibilityState !== 'visible' || sentinel || !nav?.wakeLock) return
        void request().then(() => { if (sentinel) reacquired++ })
    }
    return {
        acquire: async () => {
            wanted = true
            doc?.addEventListener('visibilitychange', onVisible)
            await request()
        },
        release: async () => {
            wanted = false
            doc?.removeEventListener('visibilitychange', onVisible)
            const s = sentinel
            sentinel = null
            if (s) { try { await s.release() } catch { /* already released */ } }
            if (state === 'held') state = 'released'
        },
        status: () => (state === 'held' && reacquired > 0 ? `held (re-acquired ${reacquired}x)` : state),
    }
}
