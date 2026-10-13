import { useAppState } from '../state'
import { GoalSetupSection } from './goalSetup/GoalSetupSection'
import { MatchDetails } from './MatchDetails'
import { Sheet } from './Sheet'

interface MatchSetupProps {
    onClose: () => void
}

/** Match setup as one scrolling page: the match (title, teams, logo), then the goal areas once there is a video. */
export function MatchSetup({ onClose }: MatchSetupProps) {
    const hasFiles = useAppState((s) => s.files.length > 0)

    return (
        <Sheet label="Match setup" onClose={onClose} className="sheet--wide">
            <MatchDetails />
            <p className="goal-areas__hint mt-2">Teams and rosters are remembered for next time.</p>
            {hasFiles && <GoalSetupSection />}
            <div className="sheet__actions">
                <span className="flex-1" />
                <button type="button" className="btn-primary" onClick={onClose}>Done</button>
            </div>
        </Sheet>
    )
}
