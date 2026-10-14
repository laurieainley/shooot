import type { GoalMarks } from '../../types'
import { MARK_STEPS, type MarkKey } from '../../utils/goalMarkSteps'

interface GoalDiagramProps {
    current: MarkKey | null
    placed: Partial<GoalMarks>
}

const CORNER: Record<MarkKey, { x: number; y: number }> = {
    postL: { x: 70, y: 74 }, postR: { x: 250, y: 74 }, barL: { x: 70, y: 16 }, barR: { x: 250, y: 16 },
    backL: { x: 26, y: 98 }, backR: { x: 294, y: 98 },
}

/** A goal drawing across the column: the point being placed is ringed, points already placed are filled and ticked, the rest hollow. */
export function GoalDiagram({ current, placed }: GoalDiagramProps) {
    return (
        <svg className="gs-diagram" viewBox="-4 -8 328 130" role="img" aria-label={current ? `Diagram of a goal: the ${current.startsWith('back') ? 'back corner' : 'post corner'} to place is highlighted` : 'Diagram of a goal'}>
            <path className="gs-diagram__net" d="M70 74L26 98L294 98L250 74Z" />
            <path className="gs-diagram__frame" d="M70 74V16H250V74" />
            {MARK_STEPS.map(({ key }, i) => {
                const { x, y } = CORNER[key]
                const state = key === current ? 'now' : placed[key] ? 'done' : 'todo'
                return (
                    <g key={key} className={`gs-diagram__pt gs-diagram__pt--${state}`} data-state={state}>
                        {state === 'now' && <circle className="gs-diagram__halo" cx={x} cy={y} r={20} />}
                        <circle className="gs-diagram__dot" cx={x} cy={y} r={state === 'now' ? 14 : 11} />
                        {state === 'done'
                            ? <path className="gs-diagram__tick" d={`M${x - 5} ${y}L${x - 1} ${y + 4}L${x + 6} ${y - 4}`} />
                            : <text className="gs-diagram__no" x={x} y={y + 4.5} textAnchor="middle">{i + 1}</text>}
                    </g>
                )
            })}
        </svg>
    )
}
