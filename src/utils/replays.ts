import type { MatchEvent } from '../types'
import { isScoring } from './eventTypes'

export function wantsReplay(e: Pick<MatchEvent, 'type' | 'replay'>): boolean {
    return e.replay ?? isScoring(e)
}
