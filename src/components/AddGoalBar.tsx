import { useAppState } from '../state'
import { formatHMS } from '../utils/timeline'

export function AddGoalBar() {
    const currentTime = useAppState((s) => s.currentTimeInFileSec)
    const markEvent = useAppState((s) => s.markEvent)
    const files = useAppState((s) => s.files)

    if (files.length === 0) return null

    return (
        <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 flex-wrap">
            <span className="w-[70px] text-sm font-semibold text-pink tabular-nums">{formatHMS(currentTime)}</span>
            <button
                onClick={() => markEvent(currentTime)}
                className="rounded bg-pink px-3 py-1.5 text-sm font-bold text-white border-none cursor-pointer hover:bg-pink/80 transition-colors"
            >
                + Event
            </button>
            <span className="ml-auto text-xs text-muted hidden md:inline">
                Press <kbd className="rounded bg-deep px-1.5 py-0.5 text-yellow font-bold text-[10px]">G</kbd>, then ⏎ for a goal or a letter for another event
            </span>
        </div>
    )
}
