import { useMemo, useState, useEffect } from 'react'
import { useAppState } from '../state'
import { generateYouTubeChapters, generateHighlightChapters } from '../utils/chapters'

export function ChaptersExport() {
    const goals = useAppState((s) => s.goals)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const setMatchStartTime = useAppState((s) => s.setMatchStartTime)
    const setGoals = useAppState((s) => s.setGoals)
    const [copied, setCopied] = useState(false)
    const [highlightCopied, setHighlightCopied] = useState(false)
    const text = useMemo(() => generateYouTubeChapters(goals, cumulativeOffsets, matchStartTimeSec, lengthBeforeGoalSec, lengthAfterGoalSec), [goals, cumulativeOffsets, matchStartTimeSec, lengthBeforeGoalSec, lengthAfterGoalSec])
    const highlightText = useMemo(() => generateHighlightChapters(goals, cumulativeOffsets, lengthBeforeGoalSec, lengthAfterGoalSec), [goals, cumulativeOffsets, lengthBeforeGoalSec, lengthAfterGoalSec])

    // Calculate score by counting goals per team
    const scoreCount = useMemo(() => {
        const teamCounts: Record<string, number> = {}
        goals.forEach(goal => {
            if (goal.team) {
                teamCounts[goal.team] = (teamCounts[goal.team] || 0) + 1
            }
        })
        return teamCounts
    }, [goals])

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
        } catch {
            /* noop */
        }
    }

    const onHighlightCopy = async () => {
        try {
            await navigator.clipboard.writeText(highlightText)
            setHighlightCopied(true)
            setTimeout(() => setHighlightCopied(false), 1200)
        } catch {
            /* noop */
        }
    }

    const onStampDownOffset = () => {
        if (matchStartTimeSec === 0) return // Nothing to stamp down

        // Apply offset only to goals from video 1 (sourceFileIndex 0) and reset offset to 0
        const adjustedGoals = goals.map(goal => ({
            ...goal,
            matchTimeSec: (goal.sourceFileIndex ?? 0) === 0
                ? Math.max(0, goal.matchTimeSec - matchStartTimeSec)
                : goal.matchTimeSec
        }))

        setGoals(adjustedGoals)
        setMatchStartTime(0)
    }

    return (
        <div>
            <div>
                <h3>Match Start Time</h3>
                <div style={{ marginBottom: 16 }}>
                    <label>
                        Video start offset:
                        <TimeInput
                            valueSec={matchStartTimeSec}
                            onCommit={setMatchStartTime}
                        />
                    </label>
                    <div style={{ fontSize: '0.9em', color: '#666', marginTop: 4 }}>
                        If your video starts before the match (e.g., 90 seconds of pre-match), enter that offset here.
                    </div>
                    <button
                        onClick={onStampDownOffset}
                        disabled={matchStartTimeSec === 0}
                        style={{ marginTop: 8 }}
                    >
                        Stamp down offset
                    </button>
                    <div style={{ fontSize: '0.9em', color: '#666', marginTop: 4 }}>
                        Apply the offset to all goal times and reset offset to 0.
                    </div>
                </div>
            </div>

            <div>
                <h3>Score</h3>
                {Object.keys(scoreCount).length > 0 ? (
                    <div style={{ marginBottom: 16 }}>
                        {Object.entries(scoreCount)
                            .sort(([, a], [, b]) => b - a) // Sort by score descending
                            .map(([team, count]) => (
                                <div key={team} style={{ marginBottom: 4 }}>
                                    <strong>{team}:</strong> {count}
                                </div>
                            ))}
                    </div>
                ) : (
                    <p style={{ marginBottom: 16, color: '#666' }}>No goals with teams yet.</p>
                )}
            </div>

            <div>
                <h3>Goalscorers</h3>
                {(() => {
                    const scorerCounts: Record<string, number> = {}
                    goals.forEach(goal => {
                        if (goal.scorer) {
                            scorerCounts[goal.scorer] = (scorerCounts[goal.scorer] || 0) + 1
                        }
                    })

                    const sortedScorers = Object.entries(scorerCounts)
                        .sort(([, a], [, b]) => b - a) // Sort by goals descending

                    return sortedScorers.length > 0 ? (
                        <div style={{ marginBottom: 16 }}>
                            {sortedScorers.map(([scorer, count]) => (
                                <div key={scorer} style={{ marginBottom: 4 }}>
                                    <strong>{scorer}:</strong> {count}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ marginBottom: 16, color: '#666' }}>No goals with scorers yet.</p>
                    )
                })()}
            </div>

            <div>
                <h3>YouTube Chapters (Original Video)</h3>
                <textarea value={text} readOnly style={{ width: '100%', height: 120 }} />
                <div style={{ marginTop: 8 }}>
                    <button onClick={onCopy}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
            </div>

            <div>
                <h3>YouTube Chapters (Highlight Video)</h3>
                <textarea value={highlightText} readOnly style={{ width: '100%', height: 120 }} />
                <div style={{ marginTop: 8 }}>
                    <button onClick={onHighlightCopy}>{highlightCopied ? 'Copied!' : 'Copy'}</button>
                </div>
                <div style={{ fontSize: '0.9em', color: '#666', marginTop: 4 }}>
                    Timestamps for the rendered highlight video. Each goal gets {lengthBeforeGoalSec + lengthAfterGoalSec + 1} seconds ({lengthBeforeGoalSec + lengthAfterGoalSec}s segment + 1s buffer).
                </div>
            </div>
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
            style={{ marginLeft: 8, width: 70 }}
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


