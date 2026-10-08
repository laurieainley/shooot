import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import { GOAL_MARKED, goalMarkedFor } from '../utils/voice'
import { NetBulge } from './NetBulge'

const SHOW_MS = 1600

/** A brief "Goal tagged." with the net bulge, over the picture, each time one scoring event is added (not on import, undo or delete). */
export function GoalMarked() {
    const events = useAppState((s) => s.events)
    const prev = useRef(events)
    const [shownFor, setShownFor] = useState<string | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    useEffect(() => {
        const id = goalMarkedFor(prev.current, events)
        prev.current = events
        if (!id) return
        setShownFor(id)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setShownFor(null), SHOW_MS)
    }, [events])
    useEffect(() => () => clearTimeout(timer.current), [])
    if (!shownFor) return null
    return (
        <div key={shownFor} role="status" className="goal-marked">
            <NetBulge mode="once" size={36} />
            <span>{GOAL_MARKED}</span>
        </div>
    )
}
