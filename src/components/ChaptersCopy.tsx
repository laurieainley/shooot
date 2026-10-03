import { useState } from 'react'
import { useAppState } from '../state'
import { generateHighlightChapters, generateYouTubeChapters } from '../utils/chapters'
import { linkedEvents } from '../utils/relink'

export function ChaptersCopy() {
    const events = useAppState((s) => s.events)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const start = useAppState((s) => s.matchStartTimeSec)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const teams = useAppState((s) => s.teams)
    const [copied, setCopied] = useState<string | null>(null)

    const linked = linkedEvents(events)
    const order = teams.map((t) => t.name)
    const copy = async (label: string, text: string): Promise<void> => {
        await navigator.clipboard.writeText(text)
        setCopied(label)
        setTimeout(() => setCopied(null), 1500)
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                disabled={linked.length === 0}
                onClick={() => copy('YouTube', generateYouTubeChapters(linked, offsets, start, before, after, order))}
                className="rounded bg-deep px-2 py-1 text-xs text-light border border-border cursor-pointer hover:border-pink disabled:opacity-30"
            >
                Copy YouTube chapters
            </button>
            <button
                disabled={linked.length === 0}
                onClick={() => copy('Highlight', generateHighlightChapters(linked, offsets, before, after, order))}
                className="rounded bg-deep px-2 py-1 text-xs text-light border border-border cursor-pointer hover:border-pink disabled:opacity-30"
            >
                Copy highlight chapters
            </button>
            {copied && <span className="text-xs text-yellow">{copied} chapters copied</span>}
        </div>
    )
}
