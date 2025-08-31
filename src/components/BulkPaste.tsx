import { useState } from 'react'
import { useAppState } from '../state'
import type { Goal } from '../types'

// Accept lines like: "03:12 Team A - Alice" or "192 TeamB Bob"
export function BulkPaste() {
    const [text, setText] = useState('')
    const addGoal = useAppState((s) => s.addGoal)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)

    const onParse = () => {
        const lines = text.split(/\r?\n/)
        for (const line of lines) {
            const g = parseLine(line, currentFileIndex)
            if (g) addGoal(g)
        }
        setText('')
    }

    return (
        <div>
            <h3>Bulk paste goals</h3>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="MM:SS Team - Scorer" style={{ width: '100%', height: 100 }} />
            <div style={{ marginTop: 6 }}>
                <button onClick={onParse}>Add Goals</button>
            </div>
        </div>
    )
}

function parseLine(line: string, sourceIdx: number): Goal | null {
    const t = line.trim()
    if (!t) return null
    const ts = t.match(/^(\d+):(\d{1,2})/) || t.match(/^(\d+)/)
    if (!ts) return null
    let seconds = 0
    if (ts.length === 3) {
        const mm = parseInt(ts[1], 10)
        const ss = parseInt(ts[2], 10)
        if (isNaN(mm) || isNaN(ss)) return null
        seconds = mm * 60 + ss
    } else if (ts.length === 2) {
        seconds = parseInt(ts[1], 10)
    }
    const rest = t.slice(ts[0].length).trim()
    let team: string | undefined
    let scorer: string | undefined
    if (rest) {
        const parts = rest.split(/[-–]|\s{2,}/)
        team = parts[0]?.trim() || undefined
        scorer = parts[1]?.trim() || undefined
    }
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, matchTimeSec: seconds, team, scorer, sourceFileIndex: sourceIdx }
}


