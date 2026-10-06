import { CloseButton } from './CloseButton'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from './Sheet'
import { usePanelSlot } from './panelSlot'

interface ColumnPanelProps {
    label: string
    onClose: () => void
    children: ReactNode
    className?: string
}

/**
 * A touch panel that takes the place of the events column (side by side) or the events area (stacked) instead of
 * floating over the picture: own header with ×, scrolling body, Esc closes. Without a slot (tests, or before the
 * shell has mounted) it falls back to a modal Sheet.
 */
export function ColumnPanel({ label, onClose, children, className = '' }: ColumnPanelProps) {
    const slot = usePanelSlot((s) => s.el)
    if (!slot) return <Sheet label={label} onClose={onClose} className={className}>{children}</Sheet>
    return createPortal(<ColumnPanelBody label={label} onClose={onClose} className={className}>{children}</ColumnPanelBody>, slot)
}

function ColumnPanelBody({ label, onClose, children, className }: ColumnPanelProps) {
    const ref = useRef<HTMLDivElement | null>(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    useEffect(() => {
        // Focus the panel, not its first field: on a phone that would pop the keyboard up over it.
        ref.current?.focus({ preventScroll: true })
        // Stacked layouts scroll the page: bring the picture back into view so it is never hidden behind the panel.
        window.scrollTo?.({ top: 0 })
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current() }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [])

    return (
        <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} className={`column-panel ${className}`}>
            <div className="column-panel__head floating__head">
                <h2 className="floating__title">{label}</h2>
                <CloseButton onClick={onClose} />
            </div>
            <div className="column-panel__body sheet__body">{children}</div>
        </div>
    )
}
