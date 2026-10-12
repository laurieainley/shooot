import { useEffect, useState } from 'react'
import { dismissToast, TOAST_MS, useToast } from '../toasts'

/** The one toast: a plain confirmation with an optional Undo. Closes after 4 s unless hovered or focused. */
export function Toast() {
    const toast = useToast()
    const [held, setHeld] = useState(false)
    const id = toast?.id
    useEffect(() => { setHeld(false) }, [id])
    useEffect(() => {
        if (id === undefined || held) return
        const t = setTimeout(() => dismissToast(id), TOAST_MS)
        return () => clearTimeout(t)
    }, [id, held])
    // The status region is always mounted, so screen readers pick up the text when it appears.
    return (
        <div className="toast-slot" role="status" aria-live="polite"
            onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
            {toast && (
                <div className="toast">
                    <span className="toast__text">{toast.text}</span>
                    {toast.action && (
                        <button type="button" className="toast__action" onClick={() => { const a = toast.action; dismissToast(toast.id); a?.run() }}>
                            {toast.action.label}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
