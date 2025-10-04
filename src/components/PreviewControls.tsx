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
            <div style={{
                padding: 12,
                backgroundColor: '#f0f8ff',
                border: '1px solid #4a90e2',
                borderRadius: 6,
                marginBottom: 12
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <strong style={{ color: '#4a90e2' }}>Preview Mode Active</strong>
                    <button
                        onClick={exitPreview}
                        style={{
                            padding: '4px 8px',
                            backgroundColor: '#ff6b6b',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: '0.9em'
                        }}
                    >
                        Exit Preview
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        onClick={prevPreviewSegment}
                        disabled={currentPreviewSegment === 0}
                        style={{
                            padding: '4px 8px',
                            backgroundColor: currentPreviewSegment === 0 ? '#ccc' : '#4a90e2',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: currentPreviewSegment === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '0.9em'
                        }}
                    >
                        ← Previous
                    </button>

                    <span style={{ fontSize: '0.9em', color: '#666' }}>
                        Segment {currentPreviewSegment + 1} of {previewSegments.length}
                    </span>

                    <button
                        onClick={nextPreviewSegment}
                        disabled={currentPreviewSegment >= previewSegments.length - 1}
                        style={{
                            padding: '4px 8px',
                            backgroundColor: currentPreviewSegment >= previewSegments.length - 1 ? '#ccc' : '#4a90e2',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: currentPreviewSegment >= previewSegments.length - 1 ? 'not-allowed' : 'pointer',
                            fontSize: '0.9em'
                        }}
                    >
                        Next →
                    </button>
                </div>

                {previewSegments.length > 0 && currentPreviewSegment < previewSegments.length && (
                    <div style={{ marginTop: 8, fontSize: '0.85em', color: '#666' }}>
                        Current segment contains {previewSegments[currentPreviewSegment].goals.length} goal(s)
                    </div>
                )}
            </div>
        )
    }

    // Show start preview button when not in preview mode and goals exist
    if (goals.length > 0) {
        return (
            <div style={{ marginBottom: 12 }}>
                <button
                    onClick={startPreview}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: '1em',
                        fontWeight: 'bold'
                    }}
                >
                    🎬 Start Highlights Preview
                </button>
                <div style={{ fontSize: '0.85em', color: '#666', marginTop: 4 }}>
                    Preview {goals.length} goal(s) in sequence without generating video
                </div>
            </div>
        )
    }

    return null
}

