import { useEffect } from 'react'
import { useAppState } from '../state'
import type { PreviewStep } from '../utils/preview'

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
    const stepPreviewClip = useAppState((s) => s.stepPreviewClip)
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

    const step = steps[current]
    usePreviewRowMarks(isPreviewMode ? step : undefined)

    if (isPreviewMode) {
        const clips = steps.length > 0 ? steps[steps.length - 1].clipIndex + 1 : 0
        const clip = (step?.clipIndex ?? 0) + 1
        return (
            <div className="preview-controls" role="group" aria-label="Preview">
                <span className="preview-controls__label">Preview</span>
                <button type="button" aria-label="Previous clip" title="Previous clip ([)" onClick={() => stepPreviewClip(-1)} disabled={current === 0} className="btn-icon">←</button>
                {/* Fixed width (sized for the largest count) so the arrows never move. */}
                <span className="preview-controls__count tc text-ui-sm" style={{ minWidth: `${6 + 2 * String(clips).length}ch` }}>Clip {clip} / {clips}</span>
                <button type="button" aria-label="Next clip" title="Next clip (])" onClick={() => stepPreviewClip(1)} disabled={clip >= clips} className="btn-icon">→</button>
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

/**
 * Highlights the events of the clip being previewed in the event list (and scrolls to them): `data-previewing` on
 * their rows ("clip", or "replay" while the slowed replay plays). Set on the rows' existing `data-event-id`, so the
 * list itself needs no preview state.
 */
function usePreviewRowMarks(step: PreviewStep | undefined): void {
    const ids = step?.eventIds.join(' ') ?? ''
    const replay = !!step?.replay
    const events = useAppState((s) => s.events) // the list re-renders rows: mark them again
    useEffect(() => {
        if (!ids) return
        const rows = ids.split(' ').flatMap((id) => Array.from(document.querySelectorAll<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`)))
        for (const r of rows) r.dataset.previewing = replay ? 'replay' : 'clip'
        rows[0]?.scrollIntoView?.({ block: 'nearest' })
        return () => { for (const r of rows) delete r.dataset.previewing }
    }, [ids, replay, events])
}
