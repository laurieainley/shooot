import { CloseButton } from './CloseButton'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAppState } from '../state'
import { Sheet } from './Sheet'
import { usePanelSlot } from './panelSlot'
import { useFullscreenUi } from './fullscreenUi'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

interface ColumnPanelProps {
    label: string
    onClose: () => void
    children: ReactNode
    className?: string
    /** Small tag next to the title (e.g. Beta). */
    badge?: ReactNode
}

/**
 * A touch panel that takes the place of the events column (side by side) or the events area (stacked) instead of
 * floating over the picture: own header with ×, scrolling body, Esc closes. Without a slot (tests, or before the
 * shell has mounted) it falls back to a modal Sheet.
 */
export function ColumnPanel({ label, onClose, children, className = '', badge }: ColumnPanelProps) {
    const slot = usePanelSlot((s) => s.el)
    const host = useFullscreenUi((s) => s.host)
    const hidden = useFullscreenUi((s) => s.reviewHidden)
    const coarse = useMediaQuery(COARSE_QUERY)
    // Touch fullscreen: only the fullscreen element is on screen, so the panel lives inside it (a column on the right, a sheet in portrait).
    const inFullscreen = !!host && coarse
    const target = inFullscreen ? host : slot
    // The panel renders into its own box, which moves between the rail and the fullscreen element, so going fullscreen (and back) keeps its state.
    const box = useMemo(() => { const d = document.createElement('div'); d.style.display = 'contents'; return d }, [])
    useLayoutEffect(() => {
        if (!target) return
        target.appendChild(box)
        return () => { box.remove() }
    }, [target, box])
    if (!target) return <Sheet label={label} onClose={onClose} className={className} badge={badge}>{children}</Sheet>
    const cls = inFullscreen ? `${className} column-panel--fs${hidden && className.includes('review') ? ' column-panel--fs-hidden' : ''}` : className
    return createPortal(<ColumnPanelBody label={label} onClose={onClose} className={cls} badge={badge}>{children}</ColumnPanelBody>, box)
}

function ColumnPanelBody({ label, onClose, children, className, badge }: ColumnPanelProps) {
    const ref = useRef<HTMLDivElement | null>(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    useEffect(() => {
        // Focus the panel, not its first field: on a phone that would pop the keyboard up over it.
        ref.current?.focus({ preventScroll: true })
        // Stacked layouts scroll the page: bring the picture back into view so it is never hidden behind the panel.
        window.scrollTo?.({ top: 0 })
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape' && useAppState.getState().picker) return // the event picker on top owns Esc
            if (e.key === 'Escape' && (e.target as Element | null)?.closest?.('[data-owns-escape]')) return
            if (e.key === 'Escape' && !ref.current?.querySelector('[data-esc-clears]')) { e.preventDefault(); e.stopPropagation(); closeRef.current() }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [])

    return (
        <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} className={`column-panel ${className}`}>
            <div className="column-panel__head floating__head">
                <h2 className="floating__title">{label}{badge}</h2>
                <CloseButton onClick={onClose} />
            </div>
            <div className="column-panel__body sheet__body">{children}</div>
        </div>
    )
}
