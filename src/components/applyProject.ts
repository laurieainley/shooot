import { useAppState } from '../state'
import { normaliseAreas } from '../utils/crop'
import { migrateEvent } from '../utils/eventTypes'
import type { TransferPayload } from '../utils/projectTransfer'

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Loads a received project into the store. Events go through setEvents, so ⌘Z brings the previous ones back. */
export function applyTransferPayload(p: TransferPayload): void {
    const st = useAppState.getState()
    const left = p.whitesAttackLeft ?? true
    st.setEvents(p.events.map((e) => migrateEvent(e, left, Array.isArray(p.teams) && p.teams.length === 2 ? p.teams : st.teams)))
    if (Array.isArray(p.teams) && p.teams.length === 2) st.setTeams(p.teams)
    st.setLengthBeforeGoal(num(p.lengthBeforeGoalSec, st.lengthBeforeGoalSec))
    st.setLengthAfterGoal(num(p.lengthAfterGoalSec, st.lengthAfterGoalSec))
    st.setReplayWindow(num(p.replayBeforeSec, st.replayBeforeSec), num(p.replayAfterSec, st.replayAfterSec))
    st.setReplaySpeed(num(p.replaySpeed, st.replaySpeed))
    if (p.graphics) st.setGraphics(p.graphics)
    if (p.fullMatch) st.setFullMatch(p.fullMatch)
    st.setMatchdayLabel(typeof p.matchdayLabel === 'string' ? p.matchdayLabel : null)
    st.setGoalAreas(normaliseAreas(p.goalAreas, left))
    if (typeof p.adjustTimestampsByOffset === 'boolean') st.setAdjustTimestampsByOffset(p.adjustTimestampsByOffset)
}
