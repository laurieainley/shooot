import { useEffect, useState } from 'react'
import { useAppState } from '../state'

export function GoalList() {
    const goals = useAppState((s) => s.goals)
    const remove = useAppState((s) => s.removeGoal)
    const update = useAppState((s) => s.updateGoal)
    const sortGoals = useAppState((s) => s.sortGoals)

    if (goals.length === 0) return <p>No goals yet.</p>

    return (
        <div>
            <h3>Goals</h3>
            <ul>
                {goals.map((g) => (
                    <li key={g.id}>
                        <TimeInput
                            valueSec={g.matchTimeSec}
                            onCommit={(t) => {
                                update(g.id, { matchTimeSec: t })
                                // Sort goals after timestamp update
                                setTimeout(() => sortGoals(), 0)
                            }}
                        />
                        <span style={{ marginLeft: 6 }}>Video {((g.sourceFileIndex ?? 0) + 1)}</span>
                        <input placeholder="Team" value={g.team ?? ''} onChange={(e) => update(g.id, { team: e.target.value })} style={{ marginLeft: 6 }} />
                        <input placeholder="Scorer" value={g.scorer ?? ''} onChange={(e) => update(g.id, { scorer: e.target.value })} style={{ marginLeft: 6 }} />
                        <button onClick={() => remove(g.id)} style={{ marginLeft: 8 }}>Delete</button>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function formatHMS(totalSeconds: number) {
    const s = Math.max(0, Math.floor(totalSeconds))
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${s % 60}`.padStart(2, '0')
    return `${mm}:${ss}`
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

function TimeInput({ valueSec, onCommit }: { valueSec: number; onCommit: (seconds: number) => void }) {
    const [text, setText] = useState(formatHMS(valueSec))
    const [lastValid, setLastValid] = useState(formatHMS(valueSec))

    useEffect(() => {
        const next = formatHMS(valueSec)
        setText(next)
        setLastValid(next)
    }, [valueSec])

    const tryCommit = () => {
        const parsed = parseTimeToSeconds(text)
        if (parsed != null) {
            onCommit(parsed)
            const norm = formatHMS(parsed)
            setText(norm)
            setLastValid(norm)
        } else {
            setText(lastValid)
        }
    }

    return (
        <input
            style={{ width: 70 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={tryCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.currentTarget.blur()
                } else if (e.key === 'Escape') {
                    setText(lastValid)
                    e.currentTarget.blur()
                }
            }}
        />
    )
}


