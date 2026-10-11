import { useEffect, useRef, useState } from 'react'
import type { Lane } from '../utils/reviewLanes'

interface LaneSwitchProps {
    lane: Lane
    counts: { all: number; top: number }
    onSelect: (lane: Lane) => void
}

/** All / Top picks. The Top picks count shows a brief "+1" when a tag arrives; nothing else moves. */
export function LaneSwitch({ lane, counts, onSelect }: LaneSwitchProps) {
    const prevTop = useRef(counts.top)
    const [gained, setGained] = useState(0)
    useEffect(() => {
        const gain = counts.top - prevTop.current
        prevTop.current = counts.top
        if (gain <= 0) return
        setGained(gain)
        const t = setTimeout(() => setGained(0), 2500)
        return () => clearTimeout(t)
    }, [counts.top])
    return (
        <div className="lanes" role="group" aria-label="Suggestions to review">
            <button type="button" className="lanes__btn" aria-pressed={lane === 'all'} onClick={() => onSelect('all')}>All ({counts.all})</button>
            <button type="button" className="lanes__btn" aria-pressed={lane === 'top'} onClick={() => onSelect('top')}>
                Top picks ({counts.top}){gained > 0 && <span className="lanes__gain" aria-hidden="true"> +{gained}</span>}
            </button>
        </div>
    )
}
