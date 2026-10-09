import { useMemo } from 'react'
import { selectClockLong, useAppState } from '../state'
import { scorebugModel, type ScorebugSide } from '../utils/playerScorebug'
import { teamBackground } from '../utils/teamColor'

interface BarProps {
    side: ScorebugSide
}

function Bar({ side }: BarProps) {
    return <span className="scorebug__bar" aria-hidden="true" style={{ background: teamBackground(side.color) }} />
}

/**
 * The score bug in the top-left of the picture (normal and fullscreen), styled like the rendered graphics:
 * leaning strip, team initials between 5 px kit-colour bars, the score in mono on lime, then the match clock.
 * Sized from the picture's width (container units); never takes pointer events so pan / tap gestures pass through.
 */
export function Scorebug() {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const playheadSec = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const clockLong = useAppState(selectClockLong)
    const model = useMemo(() => scorebugModel({ teams, events, offsets, playheadSec, clockLong }), [teams, events, offsets, playheadSec, clockLong])
    if (!model) return null

    return (
        <div className="scorebug-layer">
            <div role="status" aria-label={model.label} title={model.label} className="scorebug">
                <span className="scorebug__strip" aria-hidden="true">
                    <Bar side={model.left} />
                    <span className="scorebug__initials">{model.left.initials}</span>
                    <span className="scorebug__score">{model.score}</span>
                    <span className="scorebug__initials">{model.right.initials}</span>
                    <Bar side={model.right} />
                </span>
                {model.clock && <span className="scorebug__clock tc">{model.clock}</span>}
            </div>
        </div>
    )
}
