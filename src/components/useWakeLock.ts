import { useEffect } from 'react'

type Sentinel = { released: boolean; release: () => Promise<void> }
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> }

/** Keeps the screen on while `active` (renders on phones); taken again when the page is visible again. No-op where unsupported. */
export function useWakeLock(active: boolean): void {
    useEffect(() => {
        const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
        if (!active || !api) return
        let lock: Sentinel | null = null
        let alive = true
        const acquire = async (): Promise<void> => {
            try {
                const l = await api.request('screen')
                if (alive) lock = l
                else void l.release().catch(() => undefined)
            } catch { /* refused (battery saver, hidden page): try again when visible */ }
        }
        const onVisible = (): void => {
            if (document.visibilityState === 'visible' && alive && (!lock || lock.released)) void acquire()
        }
        void acquire()
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            alive = false
            document.removeEventListener('visibilitychange', onVisible)
            void lock?.release().catch(() => undefined)
        }
    }, [active])
}
