import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
    label: string
    onClose: () => void
    children: ReactNode
    className?: string
}

/**
 * Modal sheet: centred and at most ~560px wide on desktop and landscape phones, a bottom sheet with its own
 * scroll on portrait phones (see .sheet in App.css). Esc, the × button or a tap on the backdrop closes it.
 */
export function Sheet({ label, onClose, children, className = '' }: SheetProps) {
    const sheetRef = useRef<HTMLDivElement | null>(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    useEffect(() => {
        const previous = document.activeElement
        // Focus the sheet, not its first field: on a phone that would pop the keyboard up over the sheet.
        sheetRef.current?.focus({ preventScroll: true })
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current() }
        }
        window.addEventListener('keydown', onKey, true)
        return () => {
            window.removeEventListener('keydown', onKey, true)
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
        }
    }, [])

    return createPortal(
        <div className="sheet-backdrop" onClick={onClose}>
            <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
                className={`sheet ${className}`} onClick={(e) => e.stopPropagation()}>
                <div className="floating__head">
                    <h2 className="floating__title">{label}</h2>
                    <button type="button" aria-label="Close" className="btn-icon" onClick={onClose}>×</button>
                </div>
                <div className="sheet__body">{children}</div>
            </div>
        </div>,
        document.body,
    )
}
