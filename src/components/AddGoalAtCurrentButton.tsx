import { useAppState } from '../state'
import type { Goal } from '../types'

export function AddGoalAtCurrentButton() {
    const t = useAppState((s) => s.currentTimeInFileSec)
    const addGoal = useAppState((s) => s.addGoal)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)

    const onClick = () => {
        const goal: Goal = { id: `${Date.now()}`, matchTimeSec: Math.floor(t), sourceFileIndex: currentFileIndex }
        addGoal(goal)
    }

    return <button onClick={onClick}>Add Goal @ Current</button>
}


