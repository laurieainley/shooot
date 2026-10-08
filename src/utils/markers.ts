import type { MatchEvent } from '../types'
import { isMarker } from './eventTypes'

export function startInFile(matchStartSec: number, cumulativeOffsets: number[], fileIndex: number, durationSec: number): number | null {
    const local = matchStartSec - (cumulativeOffsets[fileIndex] ?? 0)
    return local >= 0 && local < durationSec ? local : null
}

export function homeTarget(currentSec: number, startSec: number | null): number {
    return startSec !== null && currentSec > startSec + 0.5 ? startSec : 0
}

/** Where watching an event starts: markers at themselves, other events at the start of their clip. */
export function watchFromSec(e: Pick<MatchEvent, 'type' | 'matchTimeSec'>, beforeSec: number): number {
    return isMarker(e) ? e.matchTimeSec : Math.max(0, e.matchTimeSec - beforeSec)
}
