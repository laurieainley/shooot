import { useEffect } from 'react'
import { CloseButton } from './CloseButton'
import { EventLog } from './EventLog'
import { MatchList } from './MatchList'
import { useTagUi } from './tagView'

/**
 * The events list (and Matches) over the picture, from the touch view's ⋯ menu: a sheet from the right edge, the picture dimmed
 * behind it. Watching an event closes it so the picture is back. The touch view has no rail to show them in.
 */
export function EventsSheet() {
    const sheet = useTagUi((s) => s.sheet)
    const setSheet = useTagUi((s) => s.setSheet)
    useEffect(() => {
        if (!sheet) return
        const close = (): void => setSheet(null)
        const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close() } }
        window.addEventListener('seekToGoal', close)
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('seekToGoal', close); window.removeEventListener('keydown', onKey) }
    }, [sheet, setSheet])
    if (!sheet) return null
    return (
        <>
            <div className="tv-scrim" onClick={() => setSheet(null)} aria-hidden="true" />
            <aside className="tv-sheet" role="dialog" aria-label={sheet === 'events' ? 'Events' : 'Matches'}>
                <div className="tv-sheet__head">
                    <div role="tablist" aria-label="List" className="tv-sheet__tabs">
                        <button type="button" role="tab" aria-selected={sheet === 'events'} onClick={() => setSheet('events')}>Events</button>
                        <button type="button" role="tab" aria-selected={sheet === 'matches'} onClick={() => setSheet('matches')}>Matches</button>
                    </div>
                    <CloseButton onClick={() => setSheet(null)} />
                </div>
                <div className="tv-sheet__body">{sheet === 'events' ? <EventLog /> : <MatchList showNew />}</div>
            </aside>
        </>
    )
}
