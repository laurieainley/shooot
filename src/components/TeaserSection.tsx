import type { MatchEvent, Team } from '../types'
import { teaserLine } from '../graphics/plan'
import { useAppState } from '../state'
import { teamBackground } from '../utils/teamColor'
import { EventIcon } from './icons/EventIcon'
import { FileSlot, WatchButton } from './RowParts'
import { useTeaserLength } from './useTeaserLength'

export interface TeaserSectionProps {
    moments: MatchEvent[]
    teams: Team[]
    selectedId: string | null
    clockOf: (e: MatchEvent) => string
    touch: boolean
    onSelect: (id: string) => void
    onWatch: (e: MatchEvent) => void
    onToggleReplay: (e: MatchEvent) => void
    onEdit: (e: MatchEvent) => void
    onFraming: (e: MatchEvent) => void
    onUnstar: (e: MatchEvent) => void
}

/** The "Coming up" section above the match events: a header with the length, then one row per starred moment as its line will read. */
export function TeaserSection({ moments, teams, selectedId, clockOf, touch, onSelect, onWatch, onToggleReplay, onEdit, onFraming, onUnstar }: TeaserSectionProps) {
    const { moments: n, seconds } = useTeaserLength()
    const theme = useAppState((s) => s.graphics.theme)
    const on = useAppState((s) => s.highlightsTeaser)
    const notLoaded = moments.length - n
    return (
        <section className="teaser-section" aria-label="Coming up section">
            <h3 className="teaser-section__head">
                <span className="teaser-section__title"><span aria-hidden="true">★ </span>COMING UP</span>
                <span className="teaser-section__count tc">{n} {n === 1 ? 'moment' : 'moments'} · {Math.round(seconds)} s{notLoaded > 0 ? ` (${notLoaded} not loaded)` : ''}{on ? '' : ' · off'}</span>
            </h3>
            <ol role="listbox" aria-label="Coming up" className="teaser-list m-0 list-none p-0">
                {moments.map((e) => {
                    const selected = e.id === selectedId
                    const team = teams.find((t) => t.name === e.team)
                    const replay = e.teaser?.replay === true
                    return (
                        <li key={e.id} role="option" aria-selected={selected} aria-disabled={e.unlinked ? true : undefined}
                            data-event-id={e.id} data-section="teaser" onClick={() => onSelect(e.id)} className="event-row event-row--teaser">
                            <span className="tc clock text-ui-sm">{clockOf(e)}</span>
                            <span data-team-dot className="team-dot" style={{ background: teamBackground(team?.color) }} title={e.team ?? 'No team'} />
                            <span className="event-row__icon"><EventIcon event={e} size={touch ? 22 : 18} /></span>
                            <span className="event-row__content" title={teaserLine(e, theme)}>
                                <span className="event-row__main"><span className="ev-person">{teaserLine(e, theme)}</span></span>
                                {replay && <span className="event-row__replay" title="Slow-mo replay on"><span aria-hidden="true">↻</span><span className="sr-only">slow-mo replay</span></span>}
                            </span>
                            <span className="event-row__end">
                                <span className="row-score" aria-hidden="true" />
                                <FileSlot unlinked={e.unlinked} fileKey={e.sourceFileKey} />
                                <WatchButton onWatch={() => onWatch(e)} disabled={e.unlinked} />
                            </span>
                            {selected && (
                                <div className="event-actions" role="group" aria-label="Teaser actions" onClick={(ev) => ev.stopPropagation()}>
                                    <TeaserActions event={e} touch={touch} onToggleReplay={() => onToggleReplay(e)} onEdit={() => onEdit(e)} onFraming={() => onFraming(e)} onUnstar={() => onUnstar(e)} />
                                </div>
                            )}
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}

interface TeaserActionsProps {
    event: MatchEvent
    touch: boolean
    onToggleReplay: () => void
    onEdit: () => void
    onFraming: () => void
    onUnstar: () => void
}

function TeaserActions({ event: e, touch, onToggleReplay, onEdit, onFraming, onUnstar }: TeaserActionsProps) {
    const btn = `act-btn${touch ? ' act-btn--touch' : ''}`
    const replay = e.teaser?.replay === true
    return (
        <>
            <button type="button" role="switch" aria-checked={replay} aria-label="Teaser slow-mo replay" title="Slow-mo replay in the teaser (R)"
                className={`${btn} act-switch`} onClick={onToggleReplay}>
                <span className="event-actions__label">Replay</span>
                <span className="act-switch__pill">{replay ? 'On' : 'Off'}</span>
            </button>
            <button type="button" className={btn} aria-label="Edit teaser" title="Edit this teaser moment (E)" onClick={onEdit}>
                <span aria-hidden="true">✎</span><span className="event-actions__label">Edit</span>
            </button>
            <button type="button" className={btn} aria-label="Teaser framing" disabled={!replay}
                title={replay ? 'Teaser replay framing (zoom to the goal)' : 'Turn Replay on to frame it'} onClick={onFraming}>
                <span aria-hidden="true">⌖</span><span className="event-actions__label">Framing</span>
            </button>
            <button type="button" className={`${btn} act-btn--unstar`} aria-label="Unstar" title="Take it out of the teaser (⌫)" onClick={onUnstar}>
                <span aria-hidden="true">★</span><span className="event-actions__label">Unstar</span>
            </button>
        </>
    )
}
