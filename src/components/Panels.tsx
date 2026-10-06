import { lazy, Suspense } from 'react'
import { useAppState } from '../state'
import { ClipSettings } from './ClipSettings'
import { EventSheet } from './EventSheet'
import { FilesSheet } from './FilesSheet'
import { MatchSetup } from './MatchSetup'
import { PasteList } from './PasteList'
import { Sheet } from './Sheet'

const SendProjectSheet = lazy(() => import('./SendProjectSheet').then((m) => ({ default: m.SendProjectSheet })))

/** Renders the open sheet, if any (the ⋯ menu and Export render next to their buttons). */
export function Panels() {
    const panel = useAppState((s) => s.panel)
    const close = (): void => useAppState.getState().closePanel()
    switch (panel) {
        case 'files': return <FilesSheet onClose={close} />
        case 'match': return <MatchSetup onClose={close} />
        case 'settings': return <Sheet label="Advanced settings" onClose={close} className="sheet--narrow"><ClipSettings /></Sheet>
        case 'event': return <EventSheet />
        case 'paste': return <Sheet label="Paste list" onClose={close} className="sheet--narrow"><PasteList /></Sheet>
        case 'send': return <Suspense fallback={null}><SendProjectSheet onClose={close} /></Suspense>
        default: return null
    }
}
