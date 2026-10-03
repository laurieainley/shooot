import { useMemo } from 'react'
import { useAppState } from '../state'
import { PreviewControls } from './PreviewControls'
import { RenderHighlights } from './RenderHighlights'
import { ChaptersCopy } from './ChaptersCopy'
import { linkedEvents } from '../utils/relink'
import { isScoring } from '../utils/eventTypes'

export function OutputPanel() {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)

    const score = useMemo(() => {
        const scoring = linkedEvents(events).filter(isScoring)
        return teams.map((t) => ({ name: t.name, goals: scoring.filter((e) => e.team === t.name).length }))
    }, [events, teams])
    const anyScored = score.some((t) => t.goals > 0)

    return (
        <div className="rounded-md bg-surface p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-light block mb-2.5">Output</span>

            <div className="flex flex-col gap-2">
                <PreviewControls />
                <RenderHighlights />
                <ChaptersCopy />
            </div>

            {anyScored && score.length >= 2 && (
                <div className="mt-3 pt-2.5 border-t border-deep flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-light">{score[0].name}</span>
                    <span className="text-base font-black text-yellow">
                        {score[0].goals} - {score[1].goals}
                    </span>
                    <span className="text-sm font-bold text-light">{score[1].name}</span>
                </div>
            )}
        </div>
    )
}
