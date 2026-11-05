import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import { PLAYBACK_SPEEDS, rateLabel, setPlayerRate, usePlayerRate } from './playerControl'

interface SpeedButtonProps {
    /** touch: a 44 px control button in the thumb cluster; desk: a small pill over the picture (mouse). */
    variant?: 'touch' | 'desk'
}

/** The playback rate as a visible button ("1×"); tapping opens the speeds, choosing one sets it and closes. Not shown in the preview, which owns speed there. */
export function SpeedButton({ variant = 'touch' }: SpeedButtonProps) {
    const previewing = useAppState((s) => s.isPreviewMode)
    const noVideo = useAppState((s) => s.files.length === 0)
    const rate = usePlayerRate()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
        const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
        document.addEventListener('pointerdown', onDown)
        document.addEventListener('keydown', onKey, true)
        return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true) }
    }, [open])
    useEffect(() => { if (previewing) setOpen(false) }, [previewing])

    if (variant === 'desk' && noVideo) return null // over the empty player it would do nothing
    if (previewing) return variant === 'touch' ? <span /> : null // the touch cluster is a grid: keep the cell

    return (
        <div ref={ref} className={`speedbtn speedbtn--${variant}`}>
            <button type="button" className={variant === 'touch' ? 'tv-btn tv-btn--speed tc' : 'speedbtn__main tc'} aria-label={`Playback speed, ${rateLabel(rate)}`}
                aria-expanded={open} title="Playback speed: , slower · . faster · / normal" onClick={() => setOpen((o) => !o)}>
                {rateLabel(rate)}
            </button>
            {open && (
                <div className="speedbtn__list" role="group" aria-label="Speeds">
                    {PLAYBACK_SPEEDS.map((r) => (
                        <button key={r} type="button" className="speedbtn__opt tc" aria-label={`Speed ${rateLabel(r)}`} aria-pressed={Math.abs(rate - r) < 0.01}
                            onClick={() => { setPlayerRate(r); setOpen(false) }}>{rateLabel(r)}</button>
                    ))}
                </div>
            )}
        </div>
    )
}
