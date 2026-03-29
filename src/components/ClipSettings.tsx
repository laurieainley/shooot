import { useEffect, useState } from 'react'
import { useAppState } from '../state'

function formatHMS(totalSeconds: number): string {
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

export function ClipSettings() {
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const setLengthBeforeGoal = useAppState((s) => s.setLengthBeforeGoal)
    const setLengthAfterGoal = useAppState((s) => s.setLengthAfterGoal)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const setMatchStartTime = useAppState((s) => s.setMatchStartTime)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const setAdjustTimestampsByOffset = useAppState((s) => s.setAdjustTimestampsByOffset)

    return (
        <div className="rounded-md bg-surface p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-light block mb-2.5">Clip Settings</span>

            <div className="flex gap-3 mb-2">
                <div>
                    <span className="text-[10px] text-muted block mb-1">Before</span>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthBeforeGoalSec}
                        onChange={(e) => setLengthBeforeGoal(parseInt(e.target.value) || 0)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </div>
                <div>
                    <span className="text-[10px] text-muted block mb-1">After</span>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthAfterGoalSec}
                        onChange={(e) => setLengthAfterGoal(parseInt(e.target.value) || 0)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </div>
            </div>

            <div className="mt-3">
                <span className="text-[10px] text-muted block mb-1">Match start offset</span>
                <TimeInput valueSec={matchStartTimeSec} onCommit={setMatchStartTime} />
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={adjustTimestampsByOffset}
                    onChange={(e) => setAdjustTimestampsByOffset(e.target.checked)}
                    className="accent-pink"
                />
                <span className="text-xs text-muted">Adjust timestamps by offset</span>
            </label>
        </div>
    )
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={tryCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') { setText(lastValid); e.currentTarget.blur() }
            }}
            className="w-[65px] rounded bg-deep border border-border px-2 py-1 text-sm text-light focus:border-pink focus:outline-none"
        />
    )
}
