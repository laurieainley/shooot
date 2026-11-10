import { useEffect, useRef, useState } from 'react'
import { usePrepare, appPreparer, isCoarsePointer } from '../prepare/wire'
import { PAUSE, PLAY, pillText } from '../prepare/pillText'

/** The editor header's pill: how far the background preparing of the exports has got. Hover (or tap on a touch screen) for the details. */
const canHover = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches

export function PreparePill() {
    const status = usePrepare((s) => s.status)
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLSpanElement>(null)
    useEffect(() => {
        if (!open) return
        const away = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
        const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', away)
        document.addEventListener('keydown', esc)
        return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
    }, [open])
    const touch = isCoarsePointer()
    const text = pillText(status, { touch })
    if (!text) return null
    const toggle = status.kind === 'preparing' ? { label: 'Pause preparing', glyph: PAUSE, paused: true } : status.kind === 'paused' && status.byUser ? { label: 'Resume preparing', glyph: PLAY, paused: false } : null
    return (
        <span ref={ref} className="prep-pill" data-tone={text.tone} data-open={open || undefined} onMouseEnter={() => { if (canHover()) setOpen(true) }} onMouseLeave={() => { if (canHover()) setOpen(false) }}>
            <button type="button" className="prep-pill__main" aria-expanded={open} aria-describedby="prep-pill-tip" onClick={() => { if (!canHover()) setOpen((o) => !o) }}>
                <span className="prep-pill__label tc">{text.label}</span>
            </button>
            {toggle && <button type="button" className="prep-pill__toggle" aria-label={toggle.label} title={toggle.label} onClick={() => appPreparer().setPaused(toggle.paused)}>{toggle.glyph}</button>}
            <span id="prep-pill-tip" role="tooltip" className="prep-pill__tip">{text.tip}</span>
        </span>
    )
}
