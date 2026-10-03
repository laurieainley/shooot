import { createPortal } from 'react-dom'
import { useAppState } from '../state'
import { markersForFile } from '../utils/markers'

interface TimelineMarkersProps {
    host: HTMLElement | null
    durationSec: number
}

export function TimelineMarkers({ host, durationSec }: TimelineMarkersProps) {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const fileIndex = useAppState((s) => s.currentFileIndex)
    const matchStartSec = useAppState((s) => s.matchStartTimeSec)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    if (!host) return null

    const markers = markersForFile({ events, fileIndex, durationSec, teams, matchStartSec, cumulativeOffsets })
    const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

    return createPortal(
        <>
            {markers.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    className={`timeline-marker timeline-marker--${m.kind}`}
                    style={{ left: `${m.leftPct}%`, color: m.color }}
                    title={m.title}
                    aria-label={m.title}
                    onMouseDown={stop}
                    onTouchStart={stop}
                    onClick={(e) => {
                        e.stopPropagation()
                        const ev = events.find((x) => x.id === m.id)
                        if (ev) useAppState.getState().seekToGoal(fileIndex, Math.max(0, ev.matchTimeSec - before))
                    }}
                >
                    {m.icon}
                </button>
            ))}
        </>,
        host,
    )
}
