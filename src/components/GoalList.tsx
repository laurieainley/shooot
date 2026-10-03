import { useEffect, useState } from 'react'
import { useAppState } from '../state'
import type { Goal } from '../types'

export function GoalList() {
    const goals = useAppState((s) => s.events)
    const remove = useAppState((s) => s.removeEvent)
    const update = useAppState((s) => s.updateEvent)
    const sortGoals = useAppState((s) => s.sortEvents)
    const seekToGoal = useAppState((s) => s.seekToGoal)
    const addGoal = useAppState((s) => s.addEvent)
    const undo = useAppState((s) => s.undo)
    const redo = useAppState((s) => s.redo)
    const undoStack = useAppState((s) => s.undoStack)
    const redoStack = useAppState((s) => s.redoStack)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const [showBulkPaste, setShowBulkPaste] = useState(false)
    const [bulkText, setBulkText] = useState('')

    const onBulkParse = () => {
        const lines = bulkText.split(/\r?\n/)
        for (const line of lines) {
            const g = parseLine(line, currentFileIndex)
            if (g) addGoal(g)
        }
        setBulkText('')
        setShowBulkPaste(false)
    }

    return (
        <div className="rounded-md bg-surface p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-light">Goals</span>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={undo}
                            disabled={undoStack.length === 0}
                            className="text-[10px] text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer disabled:opacity-30"
                            title="Undo (Ctrl+Z)"
                        >&#8617;</button>
                        <button
                            onClick={redo}
                            disabled={redoStack.length === 0}
                            className="text-[10px] text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer disabled:opacity-30"
                            title="Redo (Ctrl+Shift+Z)"
                        >&#8618;</button>
                        <span className="text-[9px] text-muted/50 hidden md:inline">
                            <kbd className="rounded bg-deep px-1 py-0.5 text-[9px] text-yellow/60 font-bold">⌘Z</kbd>
                        </span>
                    </div>
                    <span className="text-xs text-muted">{goals.length} marked</span>
                </div>
            </div>

            {goals.length === 0 ? (
                <p className="text-sm text-muted">No goals marked yet. Press <kbd className="text-light font-bold">G</kbd> or <kbd className="text-light font-bold">M</kbd> during playback to mark a goal.</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {goals.map((g) => (
                        <div key={g.id} className={`flex items-center gap-2 rounded bg-deep border-l-[3px] px-2.5 py-2 ${g.unlinked ? 'border-l-muted opacity-50' : 'border-l-pink'}`}>
                            <TimeInput
                                valueSec={g.matchTimeSec}
                                onCommit={(t) => {
                                    update(g.id, { matchTimeSec: t })
                                    setTimeout(() => sortGoals(), 0)
                                }}
                            />
                            <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted" title={g.unlinked ? g.sourceFileKey : undefined}>
                                {g.unlinked ? 'file missing' : `V${(g.sourceFileIndex ?? 0) + 1}`}
                            </span>
                            <input
                                placeholder="Team"
                                value={g.team ?? ''}
                                onChange={(e) => update(g.id, { team: e.target.value })}
                                className="w-[60px] rounded bg-transparent border-none text-xs text-light placeholder:text-muted/50 focus:outline-none p-0"
                            />
                            <input
                                placeholder="Scorer"
                                value={g.scorer ?? ''}
                                onChange={(e) => update(g.id, { scorer: e.target.value })}
                                className="w-[70px] rounded bg-transparent border-none text-xs text-muted placeholder:text-muted/50 focus:outline-none p-0"
                            />
                            <div className="ml-auto flex gap-1.5">
                                <button
                                    onClick={() => seekToGoal(g.sourceFileIndex ?? 0, Math.max(0, g.matchTimeSec - lengthBeforeGoalSec))}
                                    disabled={g.unlinked}
                                    className="text-xs text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={g.unlinked ? `File not loaded: ${g.sourceFileKey}` : `Watch goal (starts ${lengthBeforeGoalSec}s before)`}
                                >&#9654;</button>
                                <button
                                    onClick={() => remove(g.id)}
                                    className="text-xs text-pink/40 hover:text-pink bg-transparent border-none p-0 cursor-pointer"
                                    title="Delete goal"
                                >×</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-2.5 pt-2 border-t border-deep">
                {showBulkPaste ? (
                    <div>
                        <textarea
                            value={bulkText}
                            onChange={(e) => setBulkText(e.target.value)}
                            placeholder="MM:SS Team - Scorer"
                            className="w-full h-[80px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted resize-y focus:border-pink focus:outline-none"
                        />
                        <div className="flex gap-2 mt-1.5">
                            <button
                                onClick={onBulkParse}
                                className="rounded bg-pink px-2 py-1 text-xs font-bold text-white border-none cursor-pointer"
                            >Add Goals</button>
                            <button
                                onClick={() => setShowBulkPaste(false)}
                                className="rounded bg-transparent px-2 py-1 text-xs text-muted border-none cursor-pointer hover:text-light"
                            >Cancel</button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowBulkPaste(true)}
                        className="text-xs text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer"
                    >+ Bulk paste goals...</button>
                )}
            </div>
        </div>
    )
}

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
            className="w-[50px] rounded bg-transparent border-none text-xs font-bold text-pink tabular-nums focus:outline-none p-0"
        />
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
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, matchTimeSec: seconds, team, scorer, sourceFileIndex: sourceIdx, type: 'goal' }
}
