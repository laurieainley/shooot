import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import type { CropRect, GoalAreas, GoalTeam } from '../types'
import { teamGoalLabel } from '../utils/attack'
import { defaultGoalAreas, isSoft, swapGoalAreas } from '../utils/crop'
import { swapGoalMarks } from '../utils/goalMarks'
import { GoalMarksEditor } from './GoalMarksEditor'
import { FrameBoxes, type FrameBox } from './FrameBoxes'
import { useFrameAt, useStillAt } from './frameGrab'

/** The marking editor works from a full-resolution still, so a goal far from the camera can be zoomed right in on. */
const STILL_WIDTH = 3840
const SCRUB_DEBOUNCE_MS = 150

/**
 * Match setup: where the two goals are in the picture, on a still from the middle of the first video (the camera
 * is usually settled by then). Each box is the goal that team defends at kick-off, so replays zoom to the goal the
 * scoring team attacks (and, after a Half time marker, the ends swap).
 */
export function GoalAreasSetup() {
    const areas = useAppState((s) => s.goalAreas)
    const setAreas = useAppState((s) => s.setGoalAreas)
    const marks = useAppState((s) => s.goalMarks)
    const setAllMarks = useAppState((s) => s.setAllGoalMarks)
    const setMarks = useAppState((s) => s.setGoalMarks)
    const teams = useAppState((s) => s.teams)
    const first = useAppState((s) => s.files[0])
    const duration = first?.durationSec || 0
    const frame = useFrameAt(first?.url, duration ? duration / 2 : null)

    const [editing, setEditing] = useState<GoalTeam | null>(null)
    // Which moment the marking still comes from: remembered while this section is open, so the second goal starts from it.
    const [pickedTime, setPickedTime] = useState<number | null>(null)
    const time = Math.min(pickedTime ?? duration / 2, duration)
    const [grabTime, setGrabTime] = useState(time)
    useEffect(() => {
        const t = setTimeout(() => setGrabTime(time), SCRUB_DEBOUNCE_MS)
        return () => clearTimeout(t)
    }, [time])
    const still = useStillAt(editing ? first?.url : null, duration ? grabTime : null, STILL_WIDTH)
    // Until the sharp still is ready, mark on the picture the boxes already show.
    const editorFrame = still.frame ? still : { status: still.status, frame: frame.frame }
    const section = useRef<HTMLElement | null>(null)
    const returnTo = useRef<GoalTeam | null>(null)
    const close = (): void => { returnTo.current = editing; setEditing(null) }
    // Done / Cancel: focus goes back to that goal's Mark / Edit button.
    useEffect(() => {
        if (editing || !returnTo.current) return
        section.current?.querySelector<HTMLElement>(`[data-mark-team="${returnTo.current}"]`)?.focus()
        returnTo.current = null
    }, [editing])

    const boxes: FrameBox[] = []
    for (const [i, id] of (['team1', 'team2'] as GoalTeam[]).entries()) {
        const rect = areas?.[id]
        if (rect) boxes.push({ id, label: teamGoalLabel(teams, id), short: teams[i]?.name.trim() || `Team ${i + 1}`, rect, tone: id })
    }
    const change = (id: string, rect: CropRect): void => { if (areas) setAreas({ ...areas, [id]: rect } as GoalAreas) }

    return (
        <section ref={section} className="goal-areas" aria-label="Goal areas">
            <h3 className="export-section__title">Goal areas</h3>
            <p className="goal-areas__hint">Each box is the goal that team defends at kick-off; replays zoom to the goal the scoring team attacks. Drag a box over its goal mouth, drag any corner to resize, or mark a goal to place its posts, bar and net.</p>
            {editing ? (
                <GoalMarksEditor
                    key={editing}
                    team={editing}
                    frame={editorFrame}
                    initial={marks?.[editing] ?? null}
                    onDone={(m) => { setMarks(editing, m); close() }}
                    onCancel={close}
                    onClear={marks?.[editing] ? () => { setMarks(editing, null); close() } : undefined}
                    time={duration ? time : undefined}
                    duration={duration || undefined}
                    onTimeChange={setPickedTime}
                />
            ) : (
                <FrameBoxes
                    state={frame}
                    boxes={boxes}
                    onChange={change}
                    emptyText={first ? 'No picture available for this video here.' : 'Load a video to set the goal areas.'}
                />
            )}
            {boxes.some((b) => isSoft(b.rect)) && (
                <p className="replay-framing__warn" role="status">A very small box zooms in a lot: replays will look soft on 1080p footage.</p>
            )}
            {!editing && boxes.length > 0 && frame.frame && (
                <div className="goal-areas__row">
                    {boxes.map((b) => (
                        <button key={b.id} type="button" className="btn-quiet" data-mark-team={b.id} onClick={() => setEditing(b.id as GoalTeam)}>
                            {`${marks?.[b.id as GoalTeam] ? 'Edit' : 'Mark'} ${b.label}`}
                        </button>
                    ))}
                </div>
            )}
            {!editing && (!areas
                ? <div className="goal-areas__row"><button type="button" className="btn-quiet" disabled={!frame.frame} onClick={() => setAreas(defaultGoalAreas())}>Set goal areas</button></div>
                : (
                    <div className="goal-areas__more">
                        <button type="button" className="btn-text" onClick={() => { setAreas(swapGoalAreas(areas)); if (marks) setAllMarks(swapGoalMarks(marks)) }}>Swap which goal is whose</button>
                        <button type="button" className="btn-text" onClick={() => setAreas(defaultGoalAreas())}>Reset boxes</button>
                        <button type="button" className="btn-text" onClick={() => { setAreas(null); setAllMarks(null); setEditing(null) }}>Remove</button>
                    </div>
                ))}
        </section>
    )
}
