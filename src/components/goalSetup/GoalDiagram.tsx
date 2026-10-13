import type { GoalMarks } from '../../types'
import type { MarkKey } from '../../utils/goalMarkSteps'

interface GoalDiagramProps {
    current: MarkKey | null
    placed: Partial<GoalMarks>
}

const CORNER: Record<MarkKey, { x: number; y: number }> = {
    postL: { x: 12, y: 46 }, postR: { x: 68, y: 46 }, barL: { x: 12, y: 8 }, barR: { x: 68, y: 8 },
    backL: { x: 2, y: 54 }, backR: { x: 78, y: 54 },
}

/** A small goal drawing with the point being placed highlighted; points already placed are filled. */
export function GoalDiagram({ current, placed }: GoalDiagramProps) {
    return (
        <svg className="gs-diagram" viewBox="0 0 80 60" role="img" aria-label={current ? `Diagram of a goal: the ${current.startsWith('back') ? 'back corner' : 'post corner'} to place is highlighted` : 'Diagram of a goal'}>
            <path className="gs-diagram__net" d="M12 46L2 54L78 54L68 46Z" />
            <path className="gs-diagram__frame" d="M12 46V8H68V46" />
            {(Object.keys(CORNER) as MarkKey[]).map((k) => (
                <circle
                    key={k}
                    cx={CORNER[k].x}
                    cy={CORNER[k].y}
                    r={k === current ? 5 : 3.5}
                    className={k === current ? 'gs-diagram__dot gs-diagram__dot--now' : placed[k] ? 'gs-diagram__dot gs-diagram__dot--done' : 'gs-diagram__dot'}
                />
            ))}
        </svg>
    )
}
