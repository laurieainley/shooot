import type { MatchEvent } from '../types'
import { isMarker, isScoring } from './eventTypes'

export function wantsReplay(e: Pick<MatchEvent, 'type' | 'replay'>): boolean {
    return !isMarker(e) && (e.replay ?? isScoring(e))
}
