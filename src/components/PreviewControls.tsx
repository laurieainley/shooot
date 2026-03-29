import { useAppState } from '../state'

export function PreviewControls() {
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewSegments = useAppState((s) => s.previewSegments)
    const currentPreviewSegment = useAppState((s) => s.currentPreviewSegment)
    const startPreview = useAppState((s) => s.startPreview)
    const exitPreview = useAppState((s) => s.exitPreview)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)
    const prevPreviewSegment = useAppState((s) => s.prevPreviewSegment)
    const goals = useAppState((s) => s.goals)

    if (isPreviewMode) {
        return (
            <div className="rounded-md border border-pink bg-pink/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <strong className="text-sm text-pink">Preview Mode</strong>
                    <button
                        onClick={exitPreview}
                        className="rounded bg-pink/20 px-2 py-0.5 text-xs font-semibold text-pink border border-pink/30 cursor-pointer hover:bg-pink/30 transition-colors"
                    >
                        Exit
                    </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={prevPreviewSegment}
                        disabled={currentPreviewSegment === 0}
                        className="rounded bg-surface px-2 py-1 text-xs text-light border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border transition-colors"
                    >
                        ←
                    </button>
                    <span className="text-xs text-muted">
                        {currentPreviewSegment + 1} / {previewSegments.length}
                    </span>
                    <button
                        onClick={nextPreviewSegment}
                        disabled={currentPreviewSegment >= previewSegments.length - 1}
                        className="rounded bg-surface px-2 py-1 text-xs text-light border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border transition-colors"
                    >
                        →
                    </button>
                </div>
            </div>
        )
    }

    if (goals.length > 0) {
        return (
            <button
                onClick={startPreview}
                className="w-full rounded-md border border-pink bg-pink/10 px-3 py-2 text-sm font-bold text-pink cursor-pointer hover:bg-pink/20 transition-colors"
            >
                Preview Highlights
            </button>
        )
    }

    return null
}
