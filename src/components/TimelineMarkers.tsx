import { createPortal } from 'react-dom'
import { useAppState } from '../state'
import { markersForFile } from '../utils/markers'
import { EventIcon } from './EventTag'
import type { EventType } from '../types'

interface TimelineMarkersProps {
    host: HTMLElement | null
    durationSec: number
}

export function TimelineMarkers({ host, durationSec }: TimelineMarkersProps) {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const fileIndex = useAppState((s) => s.currentFileIndex)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    if (!host) return null

    const markers = markersForFile({ events, fileIndex, durationSec, teams, cumulativeOffsets })
    const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

    return createPortal(
        <>
            {markers.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    className={`timeline-marker timeline-marker--${m.kind}`}
                    data-tone={m.tone}
                    style={{ left: `${m.leftPct}%` }}
                    title={m.title}
                    aria-label={m.title}
                    onMouseDown={stop}
                    onTouchStart={stop}
                    onClick={(e) => {
                        e.stopPropagation()
                        const ev = events.find((x) => x.id === m.id)
                        // Flags go to the marker itself; events to the start of their clip.
                        if (ev) useAppState.getState().seekToGoal(fileIndex, Math.max(0, ev.matchTimeSec - (m.kind === 'event' ? before : 0)))
                    }}
                >
                    {m.kind !== 'event' && <EventIcon type={m.kind as EventType} />}
                </button>
            ))}
        </>,
        host,
    )
}
