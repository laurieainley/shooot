import { useState } from 'react'
import { useAppState } from '../state'
import { parseRoster } from '../utils/roster'
import { MatchGraphicsSetup } from './MatchGraphicsSetup'
import { Sheet } from './Sheet'

// Kit colours: readable as dots on both the light and the dark theme.
const SWATCHES = ['#f5f5f5', '#1f2a24', '#3a6ea5', '#c2364a', '#e0b100', '#2f8a4c', '#e36b1f', '#7a4fb3']

interface MatchSetupProps {
    onClose: () => void
}

export function MatchSetup({ onClose }: MatchSetupProps) {
    const teams = useAppState((s) => s.teams)
    const setTeams = useAppState((s) => s.setTeams)
    const renameTeam = useAppState((s) => s.renameTeam)
    const [names, setNames] = useState(teams.map((t) => t.name))
    const [rosters, setRosters] = useState(teams.map((t) => t.roster.join('\n')))

    return (
        <Sheet label="Match setup" onClose={onClose}>
                <div className="team-grid">
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
                            <div className="swatches flex flex-wrap gap-1.5">
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
                <p className="m-0 mt-2 text-[12px] text-muted">Teams and rosters are remembered for next time.</p>
                <p className="match-setup__kickoff">
                    <span className="kickoff-flag" aria-hidden="true" />
                    <span>Kick off and Final whistle are events: mark them from ＋ (keys <kbd>K</kbd> and <kbd>W</kbd>). The match clock starts at Kick off.</span>
                </p>
                <MatchGraphicsSetup />
        </Sheet>
    )
}
