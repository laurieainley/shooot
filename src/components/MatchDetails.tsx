import { MULTI_COLOR, isMultiColor, solidTeamColor, teamBackground } from '../utils/teamColor'
import { deriveInitials } from '../utils/initials'
import { RosterTags } from './RosterTags'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useAppState } from '../state'
import { parseKnownScore } from '../utils/scoreGap'
import type { Team } from '../types'
import { DEFAULT_LOGO_URLS } from '../graphics/assets'
import { GraphicsStylePicker } from './GraphicsStylePicker'
import { clearCustomLogo, loadCustomLogo, saveCustomLogo } from '../graphics/logoStore'

function LogoField() {
    const [logoUrl, setLogoUrl] = useState<string | null>(null)
    const [logoError, setLogoError] = useState('')
    const pickRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        let url: string | null = null
        let live = true
        void loadCustomLogo().then((blob) => {
            if (!live || !blob) return
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
            showLogo(file)
        } catch (e) {
            setLogoError(e instanceof Error ? e.message : String(e))
        }
    }

    const resetLogo = async (): Promise<void> => {
        await clearCustomLogo().catch(() => undefined)
        showLogo(null)
    }

    return (
        <div className="graphics-setup__logo">
            <img src={logoUrl ?? DEFAULT_LOGO_URLS[0]} alt="League logo" />
            <div className="flex flex-col items-start gap-1.5">
                <span className="text-[12px] text-muted">League logo (shown on the match graphics)</span>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-quiet" onClick={() => pickRef.current?.click()}>Replace logo</button>
                    {logoUrl && <button type="button" className="btn-quiet" onClick={() => void resetLogo()}>Use default logo</button>}
                </div>
                {logoError && <p role="alert" className="m-0 text-[12px] msg-warn">{logoError}</p>}
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
    const [name, setName] = useState(team.name)
    // While the initials box has focus it shows exactly what is typed, so clearing it to retype works.
    const [typed, setTyped] = useState<string | null>(null)
    const derived = deriveInitials(name)
    const patch = (p: Partial<Team>): void => setTeams(useAppState.getState().teams.map((t, j) => (j === i ? { ...t, ...p } : t)))

    return (
        <div className="team-card" style={{ borderTopColor: solidTeamColor(team.color, 'var(--sh-muted)') }}>
            <div className="team-card__id">
                <label className="graphics-setup__field team-card__name">
                    <span>Team {i + 1} name</span>
                    <input
                        aria-label={`Team ${i + 1} name`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => { if (name.trim() && name !== team.name) renameTeam(i, name.trim()) }}
                        className="field voice-scoreboard text-[18px]"
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
            <RosterTags label={`Team ${i + 1} roster`} names={team.roster} onChange={(roster) => patch({ roster })} />
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
    const box = (i: 0 | 1) => (
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
            <span id={labelId} className="final-score__label">Final score (if you know it)</span>
            <div className="final-score__row">
                <span className="final-score__team">{name(0)}</span>
                {box(0)}
                <span className="final-score__dash" aria-hidden="true">–</span>
                {box(1)}
                <span className="final-score__team">{name(1)}</span>
                {known && (
                    <button type="button" className="btn-quiet final-score__clear" aria-label="Clear final score" onClick={() => { setVals(['', '']); setKnown(null) }}>Clear</button>
                )}
            </div>
            {half && left && <p id={hintId} className="m-0 text-[12px] msg-warn" role="status">Enter both scores, or leave both empty.</p>}
        </div>
    )
}

interface MatchDetailsProps {
    /** Leave out the league logo and graphics style (the New match steps; Match setup keeps them). */
    compact?: boolean
}

/**
 * The match itself: Title (the matchday heading on the graphics), both teams (name, initials, colour, roster) and
 * the final score if known, and (unless compact) the league logo and graphics style. Shared by the Match setup panel and the New match steps.
 */
export function MatchDetails({ compact = false }: MatchDetailsProps = {}) {
    const teamCount = useAppState((s) => Math.min(2, s.teams.length))
    const matchdayLabel = useAppState((s) => s.matchdayLabel)
    const setMatchdayLabel = useAppState((s) => s.setMatchdayLabel)
    const [title, setTitle] = useState(matchdayLabel ?? '')

    return (
        <section className="match-details" aria-label="Match">
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
            <div className="team-grid">
                {Array.from({ length: teamCount }, (_, i) => <TeamCard key={i} index={i} />)}
            </div>
            <FinalScoreField />
            {!compact && <LogoField />}
            {!compact && <GraphicsStylePicker />}
        </section>
    )
}
