import { CloseButton } from './CloseButton'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface FloatingPanelProps {
    label: string
    anchorRef: RefObject<HTMLElement | null>
    placement: 'below' | 'above'
    onClose: () => void
    children: ReactNode
    className?: string
}

type Position = { top?: number; bottom?: number; right: number }

/**
 * Popover anchored to a trigger on desktop; a full-height sheet on narrow screens (see .floating in App.css).
 * Esc or a click outside closes it and focus returns to the trigger.
 */
export function FloatingPanel({ label, anchorRef, placement, onClose, children, className = '' }: FloatingPanelProps) {
    const panelRef = useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = useState<Position>({ right: 12, top: 56 })
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    useLayoutEffect(() => {
        const r = anchorRef.current?.getBoundingClientRect()
        if (!r || (r.width === 0 && r.height === 0)) return
        const right = Math.max(8, window.innerWidth - r.right)
        setPos(placement === 'below' ? { top: r.bottom + 6, right } : { bottom: window.innerHeight - r.top + 6, right })
    }, [anchorRef, placement])

    useEffect(() => {
        const anchor = anchorRef.current
        const first = panelRef.current?.querySelector<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ;(first ?? panelRef.current)?.focus()
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current() }
        }
        const onDown = (e: PointerEvent): void => {
            const t = e.target as Node
            if (panelRef.current?.contains(t) || anchor?.contains(t)) return
            closeRef.current()
        }
        window.addEventListener('keydown', onKey, true)
        window.addEventListener('pointerdown', onDown, true)
        return () => {
            window.removeEventListener('keydown', onKey, true)
            window.removeEventListener('pointerdown', onDown, true)
            if (anchor?.isConnected && (!document.activeElement || document.activeElement === document.body)) anchor.focus()
        }
    }, [anchorRef])

    // Portalled to <body> so no ancestor stacking context (sticky top bar, rail) can put it under other layers.
    return createPortal(
        <div ref={panelRef} role="dialog" aria-label={label} tabIndex={-1} className={`floating ${className}`} style={pos}>
            <div className="floating__head">
                <h2 className="floating__title">{label}</h2>
                <CloseButton onClick={onClose} />
            </div>
            <div className="floating__body">{children}</div>
        </div>,
        document.body,
    )
}
