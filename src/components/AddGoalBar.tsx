import { useState } from 'react'
import { useAppState } from '../state'
import type { MatchEvent } from '../types'
import { formatHMS } from '../utils/timeline'

function parseTimeToSeconds(input: string): number | null {
    const t = input.trim()
    if (!t) return null
    if (/^\d+$/.test(t)) return parseInt(t, 10)
    const m = t.match(/^(\d+):(\d{1,2})$/)
    if (!m) return null
    const mm = parseInt(m[1], 10)
    const ss = parseInt(m[2], 10)
    if (ss >= 60) return null
    return mm * 60 + ss
}

export function AddGoalBar() {
    const currentTime = useAppState((s) => s.currentTimeInFileSec)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const addEvent = useAppState((s) => s.addEvent)
    const files = useAppState((s) => s.files)

    const [time, setTime] = useState('')
    const [team, setTeam] = useState('')
    const [scorer, setScorer] = useState('')

    const onAdd = () => {
        const matchTimeSec = time ? parseTimeToSeconds(time) : Math.floor(currentTime)
        if (matchTimeSec == null) return
        const event: MatchEvent = {
            id: `${Date.now()}`,
            matchTimeSec,
            sourceFileIndex: currentFileIndex,
            type: 'goal',
            team: team || undefined,
            scorer: scorer || undefined,
        }
        addEvent(event)
        setTime('')
    }

    if (files.length === 0) return null

    return (
        <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 flex-wrap">
            <input
                placeholder={formatHMS(currentTime)}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-[70px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none"
            />
            <input
                placeholder="Team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-[90px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none hidden md:block"
            />
            <input
                placeholder="Scorer"
                value={scorer}
                onChange={(e) => setScorer(e.target.value)}
                className="w-[90px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none hidden md:block"
            />
            <button
                onClick={onAdd}
                className="rounded bg-pink px-3 py-1.5 text-sm font-bold text-white border-none cursor-pointer hover:bg-pink/80 transition-colors"
            >
                + Goal
            </button>
            <span className="ml-auto text-xs text-muted hidden md:inline">
                Press <kbd className="rounded bg-deep px-1.5 py-0.5 text-yellow font-bold text-[10px]">G</kbd> while playing
            </span>
        </div>
    )
}
