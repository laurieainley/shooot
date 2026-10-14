import { solidTeamColor } from '../utils/teamColor'
import { useAppState } from '../state'
import type { CropRect, GoalTeam } from '../types'
import { teamGoalLabel } from '../utils/attack'
import { swapGoalAreas } from '../utils/crop'
import { swapGoalMarks } from '../utils/goalMarks'
import { cropImageStyle } from '../utils/goalSetup'
import type { Frame } from './frameGrab'
import type { SetupStep } from './goalSetup/steps'

interface GoalSetupSummaryProps {
    frame: Frame | null
    onEdit: (step: SetupStep) => void
    /** Shown when nothing is set yet. */
    onSetup: () => void
    /** The small version inside New match / Match setup. */
    compact?: boolean
}

const GOALS: { team: GoalTeam; posts: SetupStep; zoom: SetupStep }[] = [
    { team: 'team1', posts: 'posts1', zoom: 'zoom1' },
    { team: 'team2', posts: 'posts2', zoom: 'zoom2' },
]

/** Two cards, one per goal: the replay view, whether the posts are identified, and a way back into each step. */
export function GoalSetupSummary({ frame, onEdit, onSetup, compact }: GoalSetupSummaryProps) {
    const areas = useAppState((s) => s.goalAreas)
    const marks = useAppState((s) => s.goalMarks)
    const teams = useAppState((s) => s.teams)
    const setAreas = useAppState((s) => s.setGoalAreas)
    const setAllMarks = useAppState((s) => s.setAllGoalMarks)

    if (!areas && !marks) {
        return (
            <section className="gs-summary" aria-label="Goal set-up">
                <div className="goal-areas__hint">
                    <p className="m-0">Mark the two goals (about a minute, optional):</p>
                    <ul className="goal-areas__why">
                        <li>Find goals catches more goals: it watches each goal for the ball.</li>
                        <li>Goal replays zoom in on the right end.</li>
                    </ul>
                </div>
                <div className="goal-areas__row"><button type="button" className="btn-quiet" onClick={onSetup}>Set up goals</button></div>
            </section>
        )
    }
    const swap = (): void => {
        if (areas) setAreas(swapGoalAreas(areas))
        if (marks) setAllMarks(swapGoalMarks(marks))
    }
    return (
        <section className={compact ? 'gs-summary gs-summary--compact' : 'gs-summary'} aria-label="Goal set-up">
            <div className="gs-cards">
                {GOALS.map(({ team, posts, zoom }) => {
                    const rect: CropRect | undefined = areas?.[team]
                    const label = teamGoalLabel(teams, team)
                    const set = !!marks?.[team]
                    return (
                        <div key={team} className={`gs-card gs-card--${team}`} role="group" aria-label={label} style={{ borderTopColor: solidTeamColor(teams[team === 'team1' ? 0 : 1]?.color ?? '', 'var(--sh-muted)') }}>
                            <div className="gs-card__thumb" style={{ aspectRatio: String(frame?.aspect ?? 16 / 9) }}>
                                {frame && rect && <img src={frame.src} alt="" draggable={false} style={cropImageStyle(rect)} />}
                                {!rect && <span className="gs-card__none">No replay zoom yet</span>}
                            </div>
                            <h4 className="gs-card__title">{label}</h4>
                            <p className="gs-card__note">
                                {set ? <><span className="gs-tick" aria-hidden="true">✓</span> Goal posts identified</> : 'No goal posts — Advanced detection needs them'}
                            </p>
                            <div className="gs-card__actions">
                                <button type="button" className="btn-quiet" data-edit={posts} onClick={() => onEdit(posts)}>Edit posts</button>
                                <button type="button" className="btn-quiet" data-edit={zoom} onClick={() => onEdit(zoom)}>Edit zoom</button>
                            </div>
                        </div>
                    )
                })}
            </div>
            <div className="goal-areas__more">
                <button type="button" className="btn-text" onClick={swap}>Swap which goal is whose</button>
                <button type="button" className="btn-text" onClick={() => { setAreas(null); setAllMarks(null) }}>Remove goal set-up</button>
            </div>
        </section>
    )
}
