import { useEffect, useRef, useState } from 'react'
import type { Lane } from '../utils/reviewLanes'

interface LaneSwitchProps {
    lane: Lane
    counts: { top: number; other: number }
    onSelect: (lane: Lane) => void
}

/** Top picks / Other moments. The Top picks count shows a brief "+1" when a tag arrives; nothing else moves. */
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
        <div className="lanes" role="group" aria-label="Moments to review">
            <button type="button" className="lanes__btn lanes__btn--top" aria-pressed={lane === 'top'} onClick={() => onSelect('top')}>
                <svg className="lanes__star" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 2.9l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.7l-5.4 3 1.1-6.1-4.5-4.3 6.1-.8z" /></svg>
                Top picks ({counts.top}){gained > 0 && <span className="lanes__gain" aria-hidden="true"> +{gained}</span>}
            </button>
            <button type="button" className="lanes__btn" aria-pressed={lane === 'other'} onClick={() => onSelect('other')}>
                <svg className="lanes__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor"><circle cx="5" cy="7" r="1.6" /><circle cx="5" cy="12" r="1.6" /><circle cx="5" cy="17" r="1.6" /><rect x="9" y="6" width="11" height="2" rx="1" /><rect x="9" y="11" width="11" height="2" rx="1" /><rect x="9" y="16" width="11" height="2" rx="1" /></svg>
                Other moments ({counts.other})
            </button>
        </div>
    )
}
