import { useAppState } from '../state'
import type { CropRect, GoalAreas } from '../types'
import { defaultGoalAreas, isSoft } from '../utils/crop'
import { FrameBoxes, type FrameBox } from './FrameBoxes'
import { useFrameAt } from './frameGrab'

/**
 * Match setup: where the two goals are in the picture, on a still from the middle of the first video (the camera
 * is usually settled by then). Replays zoom to the scoring team's goal; each half's direction is set here too.
 */
export function GoalAreasSetup() {
    const areas = useAppState((s) => s.goalAreas)
    const setAreas = useAppState((s) => s.setGoalAreas)
    const attackLeft = useAppState((s) => s.whitesAttackLeft)
    const setAttackLeft = useAppState((s) => s.setWhitesAttackLeft)
    const teamName = useAppState((s) => s.teams[0]?.name || 'Team 1')
    const first = useAppState((s) => s.files[0])
    const frame = useFrameAt(first?.url, first?.durationSec ? first.durationSec / 2 : null)

    const boxes: FrameBox[] = areas ? [
        { id: 'left', label: 'Left goal', short: 'L', rect: areas.left, tone: 'left' },
        { id: 'right', label: 'Right goal', short: 'R', rect: areas.right, tone: 'right' },
    ] : []
    const change = (id: string, rect: CropRect): void => { if (areas) setAreas({ ...areas, [id]: rect } as GoalAreas) }

    return (
        <section className="goal-areas" aria-label="Goal areas">
            <h3 className="export-section__title">Goal areas</h3>
            <p className="goal-areas__hint">Replays zoom to the goal the scoring team attacks. Drag each box over its goal mouth, drag any corner to resize.</p>
            <FrameBoxes
                state={frame}
                boxes={boxes}
                onChange={change}
                emptyText={first ? 'No picture available for this video here.' : 'Load a video to set the goal areas.'}
            />
            {areas && (isSoft(areas.left) || isSoft(areas.right)) && (
                <p className="replay-framing__warn" role="status">A very small box zooms in a lot: replays will look soft on 1080p footage.</p>
            )}
            <div className="goal-areas__row">
                {!areas
                    ? <button type="button" className="btn-quiet" disabled={!frame.frame} onClick={() => setAreas(defaultGoalAreas())}>Set goal areas</button>
                    : <>
                        <button type="button" className="btn-quiet" onClick={() => setAreas(defaultGoalAreas())}>Reset boxes</button>
                        <button type="button" className="btn-quiet" onClick={() => setAreas(null)}>Remove</button>
                    </>}
            </div>
            <div role="group" aria-label={`${teamName} attack, first half`} className="goal-areas__attack">
                <span className="goal-areas__label">{teamName} attack (first half)</span>
                <div className="chips">
                    <button type="button" className="chip" aria-pressed={attackLeft} onClick={() => setAttackLeft(true)}>◀ Left goal</button>
                    <button type="button" className="chip" aria-pressed={!attackLeft} onClick={() => setAttackLeft(false)}>Right goal ▶</button>
                </div>
                <span className="goal-areas__hint">Ends swap at a second Kick off marker (second half).</span>
            </div>
        </section>
    )
}
