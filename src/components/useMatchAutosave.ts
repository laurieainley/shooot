import { useEffect } from 'react'
import { useAppState } from '../state'
import { adoptCurrentMatch, shouldSchedule, startAppAutosaver, stopAppAutosaver } from './matchAutosave'

/** Saves the open match to this device as you work: ~1 s after a change, straight away when the page is hidden. */
export function useMatchAutosave(): void {
    useEffect(() => {
        const saver = startAppAutosaver()
        void adoptCurrentMatch()
        const unsub = useAppState.subscribe((next, prev) => { if (shouldSchedule(next, prev)) saver.schedule() })
        const onHide = (): void => { if (document.visibilityState === 'hidden') void saver.flush() }
        const onPageHide = (): void => { void saver.flush() }
        document.addEventListener('visibilitychange', onHide)
        window.addEventListener('pagehide', onPageHide)
        return () => {
            unsub()
            document.removeEventListener('visibilitychange', onHide)
            window.removeEventListener('pagehide', onPageHide)
            stopAppAutosaver(saver)
        }
    }, [])
}
