import { teamBackground } from '../utils/teamColor'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useAppState } from '../state'
import { autoInitials } from '../graphics/teamStyle'
import { DEFAULT_LOGO_URLS } from '../graphics/assets'
import { clearCustomLogo, loadCustomLogo, saveCustomLogo } from '../graphics/logoStore'

/** Match setup fields used by the rendered match graphics: matchday heading, team initials, league logo. */
export function MatchGraphicsSetup() {
    const teams = useAppState((s) => s.teams)
    const matchdayLabel = useAppState((s) => s.matchdayLabel)
    const setMatchdayLabel = useAppState((s) => s.setMatchdayLabel)
    const setTeamInitials = useAppState((s) => s.setTeamInitials)
    const [matchday, setMatchday] = useState(matchdayLabel ?? '')
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
        <section className="graphics-setup" aria-label="Match graphics">
            <h3 className="export-section__title">Match graphics</h3>
            <div className="graphics-setup__grid">
                <label className="graphics-setup__field graphics-setup__matchday">
                    <span>Matchday heading</span>
                    <input
                        aria-label="Matchday"
                        value={matchday}
                        placeholder="e.g. Matchday 3"
                        onChange={(e) => setMatchday(e.target.value)}
                        onBlur={() => setMatchdayLabel(matchday)}
                        className="field"
                    />
                </label>
                {teams.slice(0, 2).map((t, i) => (
                    <label key={i} className="graphics-setup__field">
                        <span className="flex items-center gap-1.5"><span className="team-dot flex-none" style={{ background: teamBackground(t.color) }} /><span className="truncate">{t.name || `Team ${i + 1}`} initials</span></span>
                        <input
                            aria-label={`${t.name} initials`}
                            value={t.initials ?? ''}
                            placeholder={autoInitials(t.name)}
                            maxLength={3}
                            onChange={(e) => setTeamInitials(i, e.target.value)}
                            className="field graphics-setup__initials"
                        />
                    </label>
                ))}
                <div className="graphics-setup__logo">
                    <img src={logoUrl ?? DEFAULT_LOGO_URLS[0]} alt="League logo" />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-quiet" onClick={() => pickRef.current?.click()}>Replace logo</button>
                        {logoUrl && <button type="button" className="btn-quiet" onClick={() => void resetLogo()}>Use default logo</button>}
                    </div>
                    <input ref={pickRef} aria-label="Logo file" type="file" accept="image/*" onChange={(e) => void onPick(e)} className="sr-only" tabIndex={-1} />
                </div>
            </div>
            {logoError && <p role="alert" className="m-0 text-[12px] msg-warn">{logoError}</p>}
        </section>
    )
}
