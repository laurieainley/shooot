import { useEffect, useState } from 'react'
import { useAppState } from '../state'
import { useRenderJobs } from '../renderJobs'
import { usePrepare } from '../prepare/wire'
import { preparedSummary } from '../prepare/bundle'
import { partsFileName } from '../prepare/partsFile'
import { savePreparedParts, usePartsSave } from '../prepare/partsSave'
import type { CacheKind } from '../render/unitCache'
import { formatBytes } from '../utils/fullMatch'
import { useOpenMatch } from './openMatch'

/**
 * Export panel: "Save prepared parts (1.2 GB)" once the background preparer has prepared parts for the open project. One file that goes on the card
 * with the videos, so another device (the Mac) only encodes what is left.
 */
export function SavePreparedParts() {
    const shares = usePrepare((s) => s.shares)
    const kinds = (Object.entries(shares) as [CacheKind, NonNullable<(typeof shares)[CacheKind]>][]).filter(([, v]) => v.state.readyUnits > 0).map(([k]) => k)
    const ready = kinds.reduce((a, k) => a + (shares[k]?.state.readyUnits ?? 0), 0)
    const kindsKey = kinds.join(',')
    const save = usePartsSave((s) => s)
    const rendering = useRenderJobs((s) => s.job?.phase === 'running')
    const title = useAppState((s) => s.matchdayLabel)
    const teams = useAppState((s) => s.teams)
    const projectId = useOpenMatch((s) => s.id)
    const [summary, setSummary] = useState<{ units: number; bytes: number } | null>(null)

    useEffect(() => {
        if (!kindsKey) { setSummary(null); return }
        let live = true
        // Read again as parts get ready (a short wait folds the preparer's quick updates into one read).
        const t = setTimeout(() => { void preparedSummary({ kinds: kindsKey.split(',') as CacheKind[] }).then((s) => { if (live) setSummary(s) }, () => undefined) }, 50)
        return () => { live = false; clearTimeout(t) }
    }, [kindsKey, ready, save.phase])

    if (!kindsKey || !summary || summary.units === 0) return null
    const saving = save.phase === 'saving'
    const name = partsFileName({ title, teams })
    return (
        <div className="parts-save">
            <button type="button" className="btn-quiet w-full justify-center" disabled={saving || rendering}
                onClick={() => void savePreparedParts({ name, projectId, kinds: kindsKey.split(',') as CacheKind[] })}>
                {saving ? 'Saving prepared parts…' : `Save prepared parts (${formatBytes(summary.bytes)})`}
            </button>
            <p className="export-hint m-0">{summary.units} {summary.units === 1 ? 'part' : 'parts'} prepared. Put the file on the card with the videos, and the other device only encodes the rest.</p>
            {save.phase === 'saving' && <p role="status" className="export-hint m-0">Keep this page open; Render waits until the file is written.</p>}
            {save.phase === 'saved' && (
                <p role="status" className="export-hint m-0">
                    {save.text}
                    {save.url && <> <a href={save.url} download={save.name} className="parts-save__again">Download again</a></>}
                </p>
            )}
            {save.phase === 'failed' && <p role="alert" className="export-hint msg-warn m-0">{save.text}</p>}
        </div>
    )
}
