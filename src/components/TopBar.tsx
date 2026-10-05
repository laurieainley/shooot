import { useAppState } from '../state'
import { ExportPanel } from './ExportPanel'
import { FilePills } from './FilePills'
import { OverflowMenu } from './OverflowMenu'
import { ScoreBadge } from './ScoreBadge'

interface TopBarProps {
    desktop: boolean
}

export function TopBar({ desktop }: TopBarProps) {
    return (
        <header className="top-bar">
            <span className="brand" aria-label="Shooot">SHOOOT</span>
            {desktop ? (
                <>
                    <div className="top-bar__files"><FilePills /></div>
                    <ScoreBadge />
                    <span className="top-bar__actions">
                        <button type="button" onClick={() => useAppState.getState().openPanel('match')} className="btn-quiet">Match</button>
                        <ExportPanel />
                        <OverflowMenu />
                    </span>
                </>
            ) : (
                <>
                    <span className="flex-1" />
                    <ScoreBadge compact />
                    <ExportPanel />
                    <OverflowMenu />
                </>
            )}
        </header>
    )
}
