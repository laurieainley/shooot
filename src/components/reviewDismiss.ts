// "Review moments" can be dismissed from the rail for one detection run. Per device, outside `vhm-state` (no persist version):
// the run's createdAt is remembered, so a new run shows the button again. The moments stay reachable from the strip and ⋯.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

const KEY = 'shooot-review-dismissed'

function read(): number | null {
    try {
        const n = Number(localStorage.getItem(KEY))
        return Number.isFinite(n) && n > 0 ? n : null
    } catch { return null }
}

const store = createStore<{ runAt: number | null }>(() => ({ runAt: read() }))

/** The run (createdAt) whose rail button was dismissed, or null. */
export function useDismissedRun(): number | null {
    return useStore(store, (s) => s.runAt)
}

export function setReviewDismissed(runAt: number | null): void {
    try {
        if (runAt) localStorage.setItem(KEY, String(runAt))
        else localStorage.removeItem(KEY)
    } catch { /* storage unavailable: dismissed for this tab only */ }
    store.setState({ runAt })
}

/** Re-read after storage changed behind the store's back (tests, other tabs). */
export function syncReviewDismissed(): void {
    store.setState({ runAt: read() })
}
