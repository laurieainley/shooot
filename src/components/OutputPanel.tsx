import { useMemo } from 'react'
import { useAppState } from '../state'
import { PreviewControls } from './PreviewControls'
import { RenderHighlights } from './RenderHighlights'

export function OutputPanel() {
    const goals = useAppState((s) => s.events)

    const scoreCount = useMemo(() => {
        const teamCounts: Record<string, number> = {}
        goals.forEach(goal => {
            if (goal.team) {
                teamCounts[goal.team] = (teamCounts[goal.team] || 0) + 1
            }
        })
        return teamCounts
    }, [goals])

    const teams = Object.entries(scoreCount).sort(([, a], [, b]) => b - a)

    return (
        <div className="rounded-md bg-surface p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-light block mb-2.5">Output</span>

            <div className="flex flex-col gap-2">
                <PreviewControls />
                <RenderHighlights />
            </div>

            {teams.length >= 2 && (
                <div className="mt-3 pt-2.5 border-t border-deep flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-light">{teams[0][0]}</span>
                    <span className="text-base font-black text-yellow">
                        {teams[0][1]} - {teams[1][1]}
                    </span>
                    <span className="text-sm font-bold text-light">{teams[1][0]}</span>
                </div>
            )}
        </div>
    )
}
