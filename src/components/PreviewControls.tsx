import { useAppState } from '../state'

interface PreviewControlsProps {
    onStart?: () => void
}

/** Step through the reel's segments in the player; a start button when idle, a compact bar while previewing. */
export function PreviewControls({ onStart }: PreviewControlsProps) {
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewSegments = useAppState((s) => s.previewSegments)
    const currentPreviewSegment = useAppState((s) => s.currentPreviewSegment)
    const startPreview = useAppState((s) => s.startPreview)
    const exitPreview = useAppState((s) => s.exitPreview)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)
    const prevPreviewSegment = useAppState((s) => s.prevPreviewSegment)
    const hasEvents = useAppState((s) => s.events.some((e) => !e.unlinked))

    if (isPreviewMode) {
        return (
            <div className="preview-controls" role="group" aria-label="Preview">
                <span className="preview-controls__label">Preview</span>
                <button type="button" aria-label="Previous clip" onClick={prevPreviewSegment} disabled={currentPreviewSegment === 0} className="btn-icon">←</button>
                <span className="tc text-[13px]">{currentPreviewSegment + 1} / {previewSegments.length}</span>
                <button type="button" aria-label="Next clip" onClick={nextPreviewSegment} disabled={currentPreviewSegment >= previewSegments.length - 1} className="btn-icon">→</button>
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
