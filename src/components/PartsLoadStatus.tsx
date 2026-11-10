import { answerReplace, cancelPartsLoad, dismissPartsNotice, usePartsLoad } from '../prepare/partsLoad'
import { Sheet } from './Sheet'

/** Loading a prepared parts file: the "Replace project?" question, the copy's progress with Cancel, and a note about skipped parts until dismissed. */
export function PartsLoadStatus() {
    const s = usePartsLoad((x) => x)
    if (s.phase === 'idle') return null
    if (s.phase === 'confirm') {
        return (
            <Sheet label="Replace project" onClose={cancelPartsLoad} className="sheet--narrow">
                <div role="alertdialog" aria-label="Replace project" className="flex flex-col gap-3 py-2 text-ui-md">
                    <p className="m-0">{s.incoming === 0
                        ? <>Replace your {s.existing} {s.existing === 1 ? 'event' : 'events'} with the project in this file from {s.device}? It has no events.</>
                        : <>Replace your {s.existing} {s.existing === 1 ? 'event' : 'events'} with the {s.incoming} in this file from {s.device}?</>}</p>
                    <p className="m-0 text-muted">The prepared parts load either way. ⌘Z brings your events back.</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-primary" onClick={() => answerReplace(true)}>Replace</button>
                        <button type="button" className="btn-quiet" onClick={() => answerReplace(false)}>Keep mine</button>
                    </div>
                </div>
            </Sheet>
        )
    }
    if (s.phase === 'loading') {
        const pct = s.total > 0 ? Math.floor((100 * s.done) / s.total) : 0
        return (
            <div className="parts-load">
                <span role="status" className="parts-load__text">Loading prepared parts from {s.device}… <span className="tc">{pct}%</span></span>
                <button type="button" className="btn-quiet" onClick={cancelPartsLoad}>Cancel</button>
                <span role="progressbar" aria-label="Loading prepared parts" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="parts-load__bar">
                    <i style={{ width: `${pct}%` }} />
                </span>
            </div>
        )
    }
    return (
        <div role="alert" className="parts-load">
            <span className="parts-load__text msg-warn">{s.text}</span>
            <button type="button" className="btn-quiet" onClick={dismissPartsNotice}>Dismiss</button>
        </div>
    )
}
