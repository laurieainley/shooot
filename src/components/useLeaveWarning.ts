import { useEffect } from 'react'

/** While `active`, closing, reloading or navigating away from the tab asks first (the browser's own "Leave site?" box). */
export function useLeaveWarning(active: boolean): void {
    useEffect(() => {
        if (!active) return
        const warn = (e: BeforeUnloadEvent): void => {
            e.preventDefault()
            e.returnValue = '' // older Safari / Chrome only ask when returnValue is set
        }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [active])
}
