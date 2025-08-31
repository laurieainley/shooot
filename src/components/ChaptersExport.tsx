import { useMemo, useState } from 'react'
import { useAppState } from '../state'
import { generateYouTubeChapters } from '../utils/chapters'

export function ChaptersExport() {
    const goals = useAppState((s) => s.goals)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const [copied, setCopied] = useState(false)
    const text = useMemo(() => generateYouTubeChapters(goals, cumulativeOffsets), [goals, cumulativeOffsets])

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

    return (
        <div>
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
                <h3>YouTube Chapters</h3>
                <textarea value={text} readOnly style={{ width: '100%', height: 120 }} />
                <div style={{ marginTop: 8 }}>
                    <button onClick={onCopy}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
            </div>
        </div>
    )
}


