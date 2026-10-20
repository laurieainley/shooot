import { lazy, Suspense } from 'react'
import { useAppState } from '../state'
import { ClipSettings } from './ClipSettings'
import { EventSheet } from './EventSheet'
import { FilesSheet } from './FilesSheet'
import { MatchSetup } from './MatchSetup'
import { NewMatchFlow } from './NewMatchFlow'
import { ImportModal } from './ImportModal'
import { FindGoalsSheet } from './FindGoalsSheet'
import { SuggestionReview } from './SuggestionReview'
import { useTagViewMode } from './tagView'
import { Sheet } from './Sheet'
import { ShortcutsSheet } from './ShortcutsSheet'

const SendProjectSheet = lazy(() => import('./SendProjectSheet').then((m) => ({ default: m.SendProjectSheet })))

/** Renders the open sheet, if any (the ⋯ menu and Export render next to their buttons). */
export function Panels() {
    const panel = useAppState((s) => s.panel)
    const touchView = useTagViewMode() !== 'off' // touch: Find goals is a sheet and found moments are reviewed on the timeline
    const close = (): void => useAppState.getState().closePanel()
    switch (panel) {
        case 'files': return <FilesSheet onClose={close} />
        case 'match': return <MatchSetup onClose={close} />
        case 'newmatch': return <NewMatchFlow onClose={close} />
        case 'settings': return <Sheet label="Advanced settings" onClose={close} className="sheet--narrow"><ClipSettings /></Sheet>
        case 'shortcuts': return <ShortcutsSheet onClose={close} />
        case 'review': return touchView ? <FindGoalsSheet onClose={close} /> : <SuggestionReview onClose={close} />
        case 'event': return <EventSheet />
        case 'import': return <ImportModal />
        case 'send': return <Suspense fallback={null}><SendProjectSheet onClose={close} /></Suspense>
        default: return null
    }
}
