import { useAppState } from '../state'
import type { CropRect, GoalAreas, GoalTeam } from '../types'
import { teamGoalLabel } from '../utils/attack'
import { defaultGoalAreas, isSoft, swapGoalAreas } from '../utils/crop'
import { FrameBoxes, type FrameBox } from './FrameBoxes'
import { useFrameAt } from './frameGrab'

/**
 * Match setup: where the two goals are in the picture, on a still from the middle of the first video (the camera
 * is usually settled by then). Each box is the goal that team defends at kick-off, so replays zoom to the goal the
 * scoring team attacks (and, after a Half time marker, the ends swap).
 */
export function GoalAreasSetup() {
    const areas = useAppState((s) => s.goalAreas)
    const setAreas = useAppState((s) => s.setGoalAreas)
    const teams = useAppState((s) => s.teams)
    const first = useAppState((s) => s.files[0])
    const frame = useFrameAt(first?.url, first?.durationSec ? first.durationSec / 2 : null)

    const boxes: FrameBox[] = []
    for (const [i, id] of (['team1', 'team2'] as GoalTeam[]).entries()) {
        const rect = areas?.[id]
        if (rect) boxes.push({ id, label: teamGoalLabel(teams, id), short: teams[i]?.name.trim() || `Team ${i + 1}`, rect, tone: id })
    }
    const change = (id: string, rect: CropRect): void => { if (areas) setAreas({ ...areas, [id]: rect } as GoalAreas) }

    return (
        <section className="goal-areas" aria-label="Goal areas">
            <h3 className="export-section__title">Goal areas</h3>
            <p className="goal-areas__hint">Each box is the goal that team defends at kick-off; replays zoom to the goal the scoring team attacks. Drag a box over its goal mouth, drag any corner to resize.</p>
            <FrameBoxes
                state={frame}
                boxes={boxes}
                onChange={change}
                emptyText={first ? 'No picture available for this video here.' : 'Load a video to set the goal areas.'}
            />
            {boxes.some((b) => isSoft(b.rect)) && (
                <p className="replay-framing__warn" role="status">A very small box zooms in a lot: replays will look soft on 1080p footage.</p>
            )}
            <div className="goal-areas__row">
                {!areas
                    ? <button type="button" className="btn-quiet" disabled={!frame.frame} onClick={() => setAreas(defaultGoalAreas())}>Set goal areas</button>
                    : <>
                        <button type="button" className="btn-quiet" onClick={() => setAreas(swapGoalAreas(areas))}>Swap which goal is whose</button>
                        <button type="button" className="btn-quiet" onClick={() => setAreas(defaultGoalAreas())}>Reset boxes</button>
                        <button type="button" className="btn-quiet" onClick={() => setAreas(null)}>Remove</button>
                    </>}
            </div>
        </section>
    )
}
