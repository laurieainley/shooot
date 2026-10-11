import { useMemo } from 'react'
import { useAppState } from '../state'
import { BULK_FORMAT_HINT, previewBulkPaste } from '../utils/bulkPaste'
import { formatHMS } from '../utils/timeline'
import { EventIcon } from './icons/EventIcon'

interface PasteListProps {
    text: string
    onText: (text: string) => void
    /** Add events is the dialog's lime button while this side is the active one. */
    primary: boolean
    onDone: () => void
}

/** Right half of the Import dialog: paste "07:12 Whites - Sam" lines, see them parsed, add them in one undo step. */
export function PasteList({ text, onText, primary, onDone }: PasteListProps) {
    const fileIndex = useAppState((s) => s.currentFileIndex)
    const rows = useMemo(() => previewBulkPaste(text, fileIndex), [text, fileIndex])
    const valid = rows.filter((r) => r.event)
    const invalid = rows.length - valid.length

    const add = (): void => {
        useAppState.getState().addEvents(valid.map((r) => r.event!))
        onDone()
    }

    return (
        <section aria-labelledby="import-paste-title" className="import-part">
            <h3 id="import-paste-title" className="import-part__title">Paste goal times</h3>
            <p className="import-part__hint">{BULK_FORMAT_HINT} They are added to the current video.</p>
            <textarea aria-label="Paste list" value={text} onChange={(e) => onText(e.target.value)}
                placeholder={'07:12 Whites - Sam\n23:41 Colours - Jo'} className="field tc import-paste__box" />
            {rows.length > 0 && (
                <ul aria-label="Preview" className="import-preview">
                    {rows.map((r) => (
                        <li key={r.n} className={`import-preview__row${r.event ? '' : ' import-preview__row--bad'}`}>
                            {r.event ? (
                                <>
                                    <span className="import-preview__time tc">{formatHMS(r.event.matchTimeSec)}</span>
                                    <EventIcon event={r.event} size={18} decorative />
                                    <span className="import-preview__name">{[r.event.team, r.event.scorer].filter(Boolean).join(' · ') || 'Goal'}</span>
                                </>
                            ) : (
                                <>
                                    <span className="import-preview__flag" aria-hidden="true">?</span>
                                    <span className="import-preview__name">{r.raw}</span>
                                    <span className="import-preview__why">Needs a time first</span>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <div className="import-part__actions">
                <button type="button" onClick={add} disabled={valid.length === 0} className={primary && valid.length > 0 ? 'btn-primary' : 'btn-quiet'}>
                    {valid.length > 0 ? `Add ${valid.length} ${valid.length === 1 ? 'event' : 'events'}` : 'Add events'}
                </button>
                {invalid > 0 && <span role="status" className="import-part__note">{invalid} {invalid === 1 ? 'line' : 'lines'} will be skipped</span>}
            </div>
        </section>
    )
}
