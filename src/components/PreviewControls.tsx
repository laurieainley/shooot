import { useEffect } from 'react'
import { useAppState } from '../state'

interface PreviewControlsProps {
    onStart?: () => void
}

function isTyping(el: Element | null): boolean {
    return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** Step through the reel (clips and their replays) in the player; a start button when idle, a compact bar while previewing. */
export function PreviewControls({ onStart }: PreviewControlsProps) {
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const steps = useAppState((s) => s.previewSteps)
    const current = useAppState((s) => s.currentPreviewSegment)
    const startPreview = useAppState((s) => s.startPreview)
    const exitPreview = useAppState((s) => s.exitPreview)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)
    const prevPreviewSegment = useAppState((s) => s.prevPreviewSegment)
    const hasEvents = useAppState((s) => s.events.some((e) => !e.unlinked))

    // Esc leaves the preview (unless a menu, sheet or the picker has it).
    useEffect(() => {
        if (!isPreviewMode) return
        const onKey = (e: KeyboardEvent): void => {
            if (e.key !== 'Escape' || e.defaultPrevented) return
            const st = useAppState.getState()
            if (st.picker || st.panel || isTyping(document.activeElement)) return
            st.exitPreview()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isPreviewMode])

    if (isPreviewMode) {
        const step = steps[current]
        const clips = steps.length > 0 ? steps[steps.length - 1].clipIndex + 1 : 0
        return (
            <div className="preview-controls" role="group" aria-label="Preview">
                <span className="preview-controls__label">Preview</span>
                <button type="button" aria-label="Previous" onClick={prevPreviewSegment} disabled={current === 0} className="btn-icon">←</button>
                <span className="tc text-[13px]">Clip {(step?.clipIndex ?? 0) + 1} / {clips}{step?.replay ? ' · replay' : ''}</span>
                <button type="button" aria-label="Next" onClick={nextPreviewSegment} disabled={current >= steps.length - 1} className="btn-icon">→</button>
                <button type="button" onClick={exitPreview} className="btn-quiet">Exit</button>
            </div>
        )
    }

    return (
        <button type="button" disabled={!hasEvents} onClick={() => { startPreview(); onStart?.() }} className="btn-quiet w-full justify-center">
            Preview in player
        </button>
    )
}
