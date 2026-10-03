import { useState } from 'react'
import { useAppState } from '../state'
import { parseRoster } from '../utils/roster'
import { TimeInput } from './TimeInput'

// Kit colours: readable as dots on both the light and the dark theme.
const SWATCHES = ['#f5f5f5', '#1f2a24', '#3a6ea5', '#c2364a', '#e0b100', '#2f8a4c', '#e36b1f', '#7a4fb3']

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
        <div className="modal-backdrop" onClick={onClose}>
            <div role="dialog" aria-label="Match setup" className="modal" onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
                <div className="floating__head">
                    <h2 className="floating__title">Match setup</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="btn-icon">×</button>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {teams.map((team, i) => (
                        <div key={i} className="team-card" style={{ borderTopColor: team.color }}>
                            <input
                                aria-label={`Team ${i + 1} name`}
                                value={names[i]}
                                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                                onBlur={() => {
                                    if (names[i].trim() && names[i] !== team.name) renameTeam(i, names[i].trim())
                                }}
                                className="field font-display text-[18px] font-semibold"
                            />
                            <div className="flex gap-1.5">
                                {SWATCHES.map((c) => (
                                    <button
                                        key={c}
                                        aria-label={`Team ${i + 1} colour ${c}`}
                                        onClick={() => setTeams(teams.map((t, j) => (j === i ? { ...t, color: c } : t)))}
                                        aria-pressed={team.color === c}
                                        className="swatch"
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
                                className="field h-36 resize-y text-[13px]"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                    <span className="flex items-center gap-2 text-[13px] text-muted"><span className="kickoff-flag" aria-hidden="true" />Kick-off</span>
                    <TimeInput valueSec={matchStartTimeSec} onCommit={setMatchStartTime} ariaLabel="Match start" />
                    <button onClick={applyCurrentTime} className="btn-quiet">
                        Use current time
                    </button>
                </div>
            </div>
        </div>
    )
}
