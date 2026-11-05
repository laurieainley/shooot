import { useLayoutEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import type { MatchEvent } from '../types'
import { hasMark } from '../utils/eventTypes'
import { FloatingPanel } from './FloatingPanel'

export interface StarMenuProps {
    event: MatchEvent
    /** Controlled open state (the row's S key opens it); uncontrolled when absent. */
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

/**
 * The action row's ★ Star: a small popover menu with one checkbox item per kind of star (only the teaser for now).
 * Ticking toggles the star and keeps the menu open; Esc closes it and focus returns to the button.
 */
export function StarMenu({ event, open: controlled, onOpenChange }: StarMenuProps) {
    const [own, setOwn] = useState(false)
    const [placement, setPlacement] = useState<'below' | 'above'>('below')
    const anchorRef = useRef<HTMLButtonElement>(null)
    const open = controlled ?? own
    // Placed whenever it opens, by click or by the row's S key: above the button when there is little room below it.
    useLayoutEffect(() => {
        if (!open) return
        const r = anchorRef.current?.getBoundingClientRect()
        setPlacement(r && r.height > 0 && window.innerHeight - r.bottom < 160 && r.top > window.innerHeight - r.bottom ? 'above' : 'below')
    }, [open])
    const setOpen = (next: boolean): void => {
        setOwn(next)
        onOpenChange?.(next)
    }
    const teaser = hasMark(event, 'teaser')

    return (
        <>
            <button ref={anchorRef} type="button" className="act-btn" aria-label="Star" title="Star this moment (S)"
                aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
                <span aria-hidden="true" className={`act-star${teaser ? ' act-star--on' : ''}`}>{teaser ? '★' : '☆'}</span><span className="event-actions__label">Star</span>
            </button>
            {open && (
                <FloatingPanel label="Star" anchorRef={anchorRef} placement={placement} onClose={() => setOpen(false)} className="star-menu">
                    <div role="menu" aria-label="Star" className="star-menu__body">
                        <button type="button" role="menuitemcheckbox" aria-checked={teaser} data-autofocus
                            className="star-menu__item" onClick={() => useAppState.getState().toggleMark(event.id, 'teaser')}>
                            <span aria-hidden="true" className="star-menu__box">{teaser ? '✓' : ''}</span>
                            <span>Teaser (top of video)</span>
                        </button>
                    </div>
                </FloatingPanel>
            )}
        </>
    )
}
