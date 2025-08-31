import React, { useState } from 'react'
import { useAppState } from '../state'
import type { Goal } from '../types'

export function AddGoalControls() {
    const [team, setTeam] = useState('')
    const [scorer, setScorer] = useState('')
    const [time, setTime] = useState('') // mm:ss or seconds
    const addGoal = useAppState((s) => s.addGoal)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const files = useAppState((s) => s.files)
    const [sourceIdx, setSourceIdx] = useState<number>(0)

    React.useEffect(() => {
        setSourceIdx(currentFileIndex)
    }, [currentFileIndex])

    const onAdd = () => {
        const matchTimeSec = parseTimeToSeconds(time)
        if (matchTimeSec == null) return
        const goal: Goal = {
            id: `${Date.now()}`,
            matchTimeSec,
            sourceFileIndex: sourceIdx,
            team: team || undefined,
            scorer: scorer || undefined,
        }
        addGoal(goal)
        setTime('')
    }

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="MM:SS or seconds" value={time} onChange={(e) => setTime(e.target.value)} />
            <select value={sourceIdx} onChange={(e) => setSourceIdx(parseInt(e.target.value, 10))}>
                {files.map((_, i) => (
                    <option value={i} key={i}>Video {i + 1}</option>
                ))}
            </select>
            <input placeholder="Team" value={team} onChange={(e) => setTeam(e.target.value)} />
            <input placeholder="Scorer" value={scorer} onChange={(e) => setScorer(e.target.value)} />
            <button onClick={onAdd}>Add Goal</button>
        </div>
    )
}

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


