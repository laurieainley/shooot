import { useState } from 'react'
import { useAppState } from '../state'
import { CARD_SEC } from '../graphics/layout'
import { fullMatchDescription, highlightsDescription } from '../utils/descriptions'
import { goalscorersText } from '../utils/goalscorers'
import { linkedEvents } from '../utils/relink'

interface DescriptionCopyProps {
    /** Which video the description is for. */
    kind: 'highlights' | 'fullMatch'
}

/** Copies a YouTube description (score, chapters, scorers) for one of the exports, or just the goalscorers. */
export function DescriptionCopy({ kind }: DescriptionCopyProps) {
    const hasEvents = useAppState((s) => linkedEvents(s.events).length > 0)
    const [copied, setCopied] = useState<string | null>(null)

    const copy = async (label: string, make: () => string): Promise<void> => {
        await navigator.clipboard.writeText(make())
        setCopied(label)
        setTimeout(() => setCopied(null), 1500)
    }
    const description = (): string => {
        const st = useAppState.getState()
        const args = {
            events: st.events, teams: st.teams, cumulativeOffsets: st.cumulativeOffsets,
            before: st.lengthBeforeGoalSec, after: st.lengthAfterGoalSec,
            replay: { beforeSec: st.replayBeforeSec, afterSec: st.replayAfterSec, speed: st.replaySpeed },
            introSec: st.graphics.cards && st.teams.length >= 2 ? CARD_SEC : 0,
        }
        return kind === 'highlights' ? highlightsDescription(args) : fullMatchDescription(args)
    }
    const label = kind === 'highlights' ? 'highlights description' : 'full match description'

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!hasEvents} onClick={() => copy('Description', description)} className="btn-quiet">
                Copy {label}
            </button>
            <button type="button" disabled={!hasEvents}
                onClick={() => copy('Goalscorers', () => { const st = useAppState.getState(); return goalscorersText(st.events, st.teams, st.cumulativeOffsets) })}
                className="btn-quiet">
                Copy goalscorers
            </button>
            {copied && <span role="status" className="text-[12px] text-lime-text">{copied} copied</span>}
        </div>
    )
}
