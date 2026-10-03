import { useState } from 'react'
import { useAppState } from '../state'
import { parseRoster } from '../utils/roster'
import { TimeInput } from './TimeInput'

const SWATCHES = ['#f5f5f5', '#f72585', '#4cc9f0', '#fee440', '#22c55e', '#f4a261']

interface MatchSetupProps {
    onClose: () => void
}

export function MatchSetup({ onClose }: MatchSetupProps) {
    const teams = useAppState((s) => s.teams)
    const setTeams = useAppState((s) => s.setTeams)
    const renameTeam = useAppState((s) => s.renameTeam)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const setMatchStartTime = useAppState((s) => s.setMatchStartTime)
    const [names, setNames] = useState(teams.map((t) => t.name))
    const [rosters, setRosters] = useState(teams.map((t) => t.roster.join('\n')))

    const applyCurrentTime = (): void => {
        const st = useAppState.getState()
        setMatchStartTime(Math.floor((st.cumulativeOffsets[st.currentFileIndex] ?? 0) + st.currentTimeInFileSec))
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-2xl rounded-lg bg-surface p-4" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-light">Match setup</span>
                    <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-muted hover:text-light cursor-pointer">✕</button>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {teams.map((team, i) => (
                        <div key={i} className="flex flex-col gap-2">
                            <input
                                aria-label={`Team ${i + 1} name`}
                                value={names[i]}
                                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                                onBlur={() => {
                                    if (names[i].trim() && names[i] !== team.name) renameTeam(i, names[i].trim())
                                }}
                                className="rounded bg-deep border border-border px-2 py-1.5 text-sm font-bold text-light focus:border-pink focus:outline-none"
                            />
                            <div className="flex gap-1.5">
                                {SWATCHES.map((c) => (
                                    <button
                                        key={c}
                                        aria-label={`Team ${i + 1} colour ${c}`}
                                        onClick={() => setTeams(teams.map((t, j) => (j === i ? { ...t, color: c } : t)))}
                                        className={`h-5 w-5 rounded-full border-2 cursor-pointer ${team.color === c ? 'border-light' : 'border-transparent'}`}
                                        style={{ background: c }}
                                    />
                                ))}
                            </div>
                            <textarea
                                aria-label={`Team ${i + 1} roster`}
                                placeholder="Paste players — one per line or comma-separated"
                                value={rosters[i]}
                                onChange={(e) => setRosters(rosters.map((r, j) => (j === i ? e.target.value : r)))}
                                onBlur={() => {
                                    const roster = parseRoster(rosters[i])
                                    setTeams(useAppState.getState().teams.map((t, j) => (j === i ? { ...t, roster } : t)))
                                    setRosters(rosters.map((r, j) => (j === i ? roster.join('\n') : r)))
                                }}
                                className="h-36 rounded bg-deep border border-border px-2 py-1.5 text-sm text-light focus:border-pink focus:outline-none"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <span className="text-xs text-muted">Match start</span>
                    <TimeInput valueSec={matchStartTimeSec} onCommit={setMatchStartTime} ariaLabel="Match start" />
                    <button onClick={applyCurrentTime} className="rounded bg-deep px-2 py-1 text-xs text-light border border-border cursor-pointer hover:border-pink">
                        Use current time
                    </button>
                </div>
            </div>
        </div>
    )
}
