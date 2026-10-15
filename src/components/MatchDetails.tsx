import { MULTI_COLOR, isMultiColor, teamBackground } from '../utils/teamColor'
import { deriveInitials } from '../utils/initials'
import { RosterTags } from './RosterTags'
import { KitShirt } from './KitShirt'
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useAppState } from '../state'
import { parseKnownScore } from '../utils/scoreGap'
import type { Team } from '../types'
import { DEFAULT_LOGO_URLS } from '../graphics/assets'
import { GraphicsStylePicker } from './GraphicsStylePicker'
import { clearCustomLogo, hideLogo, loadCustomLogo, saveCustomLogo } from '../graphics/logoStore'

function LogoField() {
    const [logoUrl, setLogoUrl] = useState<string | null>(null)
    const [noLogo, setNoLogo] = useState(false)
    const [logoError, setLogoError] = useState('')
    const pickRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        let url: string | null = null
        let live = true
        void loadCustomLogo().then((blob) => {
            if (!live || !blob) return
            if (blob === 'none') { setNoLogo(true); return }
            url = URL.createObjectURL(blob)
            setLogoUrl(url)
        })
        return () => { live = false; if (url) URL.revokeObjectURL(url) }
    }, [])

    const showLogo = (blob: Blob | null): void => {
        setLogoUrl((old) => { if (old) URL.revokeObjectURL(old); return blob ? URL.createObjectURL(blob) : null })
    }

    const onPick = async (evt: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = evt.target.files?.[0]
        evt.target.value = ''
        if (!file) return
        try {
            await saveCustomLogo(file)
            setLogoError('')
            setNoLogo(false)
            showLogo(file)
        } catch (e) {
            setLogoError(e instanceof Error ? e.message : String(e))
        }
    }

    const resetLogo = async (): Promise<void> => {
        await clearCustomLogo().catch(() => undefined)
        setNoLogo(false)
        showLogo(null)
    }

    const removeLogo = async (): Promise<void> => {
        try {
            await hideLogo()
            setLogoError('')
            setNoLogo(true)
            showLogo(null)
        } catch (e) {
            setLogoError(e instanceof Error ? e.message : String(e))
        }
    }

    return (
        <div className="graphics-setup__logo">
            {noLogo
                ? <div className="graphics-setup__nologo text-ui-xs text-muted" role="img" aria-label="No league logo">No logo</div>
                : <img src={logoUrl ?? DEFAULT_LOGO_URLS[0]} alt="League logo" />}
            <div className="flex flex-col items-start gap-1.5">
                <span className="text-ui-sm text-muted">League logo (shown on the match graphics)</span>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-quiet" onClick={() => pickRef.current?.click()}>Replace logo</button>
                    {(logoUrl || noLogo) && <button type="button" className="btn-quiet" onClick={() => void resetLogo()}>Use default logo</button>}
                    {!noLogo && <button type="button" className="btn-quiet" onClick={() => void removeLogo()}>Remove logo</button>}
                </div>
                {logoError && <p role="alert" className="m-0 text-ui-xs msg-warn">{logoError}</p>}
            </div>
            <input ref={pickRef} aria-label="Logo file" type="file" accept="image/*" onChange={(e) => void onPick(e)} className="sr-only" tabIndex={-1} />
        </div>
    )
}

// Kit colours: readable as dots on both the light and the dark theme.
const SWATCHES = ['#f5f5f5', '#1f2a24', '#3a6ea5', '#c2364a', '#e0b100', '#2f8a4c', '#e36b1f', '#7a4fb3']

interface TeamCardProps {
    index: number
}

/** One team: name with its initials beside it, kit colour, roster as tags. */
function TeamCard({ index: i }: TeamCardProps) {
    const team = useAppState((s) => s.teams[i])
    const setTeams = useAppState((s) => s.setTeams)
    const renameTeam = useAppState((s) => s.renameTeam)
    const setTeamInitials = useAppState((s) => s.setTeamInitials)
    const known = useAppState((s) => s.knownPlayers)
    const forgetPlayer = useAppState((s) => s.forgetPlayer)
    const allTeams = useAppState((s) => s.teams)
    const [name, setName] = useState(team.name)
    // While the initials box has focus it shows exactly what is typed, so clearing it to retype works.
    const [typed, setTyped] = useState<string | null>(null)
    const derived = deriveInitials(name)
    const patch = (p: Partial<Team>): void => setTeams(useAppState.getState().teams.map((t, j) => (j === i ? { ...t, ...p } : t)))

    return (
        <div className="team-card">
            <div className="team-card__id">
                <span data-testid="team-shirt" className="team-card__shirt"><KitShirt color={team.color} label={typed ?? team.initials ?? derived} size={64} /></span>
                <label className="graphics-setup__field team-card__name">
                    <span>Team {i + 1} name</span>
                    <input
                        aria-label={`Team ${i + 1} name`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => { if (name.trim() && name !== team.name) renameTeam(i, name.trim()) }}
                        className="field"
                    />
                </label>
                <label className="graphics-setup__field team-card__initials">
                    <span>Initials</span>
                    <input
                        aria-label={`Team ${i + 1} initials`}
                        value={typed ?? team.initials ?? derived}
                        placeholder={derived}
                        maxLength={3}
                        onFocus={() => setTyped(team.initials ?? derived)}
                        onChange={(e) => { setTyped(e.target.value.toUpperCase()); setTeamInitials(i, e.target.value) }}
                        onBlur={() => setTyped(null)}
                        className="field graphics-setup__initials"
                    />
                </label>
            </div>
            <div className="swatches flex flex-wrap gap-1.5" role="group" aria-label={`Team ${i + 1} colour`}>
                {SWATCHES.map((c) => (
                    <button
                        key={c}
                        aria-label={`Team ${i + 1} colour ${c}`}
                        onClick={() => patch({ color: c })}
                        aria-pressed={team.color === c}
                        className="swatch"
                        style={{ background: c }}
                    />
                ))}
                <button
                    aria-label={`Team ${i + 1} colour multicolour`}
                    title="Multicolour"
                    onClick={() => patch({ color: MULTI_COLOR })}
                    aria-pressed={isMultiColor(team.color)}
                    className="swatch"
                    style={{ background: teamBackground(MULTI_COLOR) }}
                />
            </div>
            <RosterTags
                label={`Team ${i + 1} roster`}
                names={team.roster}
                onChange={(roster) => patch({ roster })}
                known={known}
                exclude={allTeams.flatMap((t) => t.roster)}
                onForget={forgetPlayer}
                color={team.color}
            />
        </div>
    )
}

const digits = (v: string): string => v.replace(/\D/g, '').slice(0, 2)

/** The final score, if the user already knows it: two boxes saved together (both whole numbers, or both empty for none). */
function FinalScoreField() {
    const teams = useAppState((s) => s.teams)
    const known = useAppState((s) => s.knownFinalScore)
    const setKnown = useAppState((s) => s.setKnownFinalScore)
    const [vals, setVals] = useState<[string, string]>(() => [known ? String(known[0]) : '', known ? String(known[1]) : ''])
    const [left, setLeft] = useState(false) // focus has left the row once: now a half-filled score gets its hint
    const labelId = useId()
    const hintId = useId()
    // Follows the store when the score changes elsewhere (Clear, a loaded project, a new match).
    useEffect(() => {
        setVals((cur) => {
            const now = parseKnownScore(cur.every((v) => v !== '') ? [Number(cur[0]), Number(cur[1])] : null)
            if (known && now && now[0] === known[0] && now[1] === known[1]) return cur
            if (!known && cur[0] === '' && cur[1] === '') return cur
            if (!known && (cur[0] === '') !== (cur[1] === '')) return cur // half typed: keep it
            return known ? [String(known[0]), String(known[1])] : ['', '']
        })
    }, [known])
    const name = (i: 0 | 1): string => teams[i]?.name?.trim() || `Team ${i + 1}`
    const save = (v: [string, string]): void => {
        if (v[0] === '' && v[1] === '') setKnown(null)
        else if (v[0] !== '' && v[1] !== '') setKnown([Number(v[0]), Number(v[1])])
    }
    const half = (vals[0] === '') !== (vals[1] === '')
    // A stepper always sets a whole score: from empty (or half typed) the empty side counts as 0.
    const step = (i: 0 | 1, d: 1 | -1): void => {
        const cur = vals.map((v) => (v === '' ? 0 : Number(v)))
        if (d === -1 && vals[0] === '' && vals[1] === '') return
        cur[i] = Math.max(0, Math.min(99, cur[i] + d))
        const next: [string, string] = [String(cur[0]), String(cur[1])]
        setVals(next)
        save(next)
    }
    const side = (i: 0 | 1) => (
        <div className="final-score__side">
            <span className="final-score__team">{name(i)}</span>
            <div className="final-score__stepper">
                <button type="button" className="final-score__step" aria-label={`One fewer for ${name(i)}`} onClick={() => step(i, -1)}>
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
                <input
                    aria-label={`${name(i)} final score`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={vals[i]}
                    onChange={(e) => setVals((cur) => (i === 0 ? [digits(e.target.value), cur[1]] : [cur[0], digits(e.target.value)]))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setLeft(true); save(vals) } }}
                    className="field final-score__box"
                    aria-describedby={half && left ? hintId : undefined}
                />
                <button type="button" className="final-score__step" aria-label={`One more for ${name(i)}`} onClick={() => step(i, 1)}>
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
            </div>
        </div>
    )
    return (
        <div
            role="group"
            aria-labelledby={labelId}
            className="final-score"
            onBlur={(e) => {
                if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
                setLeft(true)
                save(vals)
            }}
        >
            <div className="final-score__head">
                <span id={labelId} className="final-score__label">Final score (if you know it)</span>
                {known && (
                    <button type="button" className="btn-quiet final-score__clear" aria-label="Clear final score" onClick={() => { setVals(['', '']); setKnown(null) }}>Clear</button>
                )}
            </div>
            <div className="final-score__row">
                {side(0)}
                <span className="final-score__dash" aria-hidden="true">–</span>
                {side(1)}
            </div>
            {half && left && <p id={hintId} className="m-0 text-ui-xs msg-warn" role="status">Enter both scores, or leave both empty.</p>}
        </div>
    )
}

/** "Whites v Colours" under the title, from the live team names, each with a little kit shirt. Decorative. */
function Fixture() {
    const teams = useAppState((s) => s.teams)
    const [a, b] = teams
    if (!a || !b) return null
    const nm = (t: Team, i: number): string => t.name.trim() || `Team ${i + 1}`
    return (
        <p className="fixture" data-testid="fixture" aria-hidden="true">
            <KitShirt color={a.color} size={22} /><span className="fixture__name">{nm(a, 0)}{' '}</span>
            <span className="fixture__v">v{' '}</span>
            <KitShirt color={b.color} size={22} /><span className="fixture__name">{nm(b, 1)}</span>
        </p>
    )
}

interface MatchDetailsProps {
    /** Leave out the league logo and graphics style (the New match steps; Match setup keeps them). */
    compact?: boolean
    /** Rendered with the logo and graphics style in the side column (Match setup: the goal areas). */
    aside?: ReactNode
}

/**
 * The match itself: Title (the matchday heading on the graphics), both teams (name, initials, colour, roster) and
 * the final score if known, and (unless compact) the league logo and graphics style. Shared by the Match setup panel and the New match steps.
 */
export function MatchDetails({ compact = false, aside }: MatchDetailsProps = {}) {
    const teamCount = useAppState((s) => Math.min(2, s.teams.length))
    const matchdayLabel = useAppState((s) => s.matchdayLabel)
    const setMatchdayLabel = useAppState((s) => s.setMatchdayLabel)
    const [title, setTitle] = useState(matchdayLabel ?? '')

    return (
        <section className={`match-details${compact ? '' : ' match-details--split'}`} aria-label="Match">
            <div className="match-details__main">
                <label className="graphics-setup__field match-details__title">
                    <span>Title</span>
                    <input
                        aria-label="Title"
                        value={title}
                        placeholder="Matchday 3"
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => setMatchdayLabel(title)}
                        className="field"
                    />
                </label>
                <Fixture />
                <div className="team-grid">
                    {Array.from({ length: teamCount }, (_, i) => <TeamCard key={i} index={i} />)}
                </div>
                <FinalScoreField />
                {!compact && <p className="goal-areas__hint mt-2">Teams and rosters are remembered for next time.</p>}
            </div>
            {!compact && (
                <div className="match-details__side">
                    <LogoField />
                    <GraphicsStylePicker />
                    {aside}
                </div>
            )}
        </section>
    )
}
