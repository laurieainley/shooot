import { useRef, useState } from 'react'
import { ExportPanel } from './ExportPanel'
import { FilePills } from './FilePills'
import { FloatingPanel } from './FloatingPanel'
import { ScoreBadge } from './ScoreBadge'

interface TopBarProps {
    desktop: boolean
    onOpenMatch: () => void
}

export function TopBar({ desktop, onOpenMatch }: TopBarProps) {
    const [overflow, setOverflow] = useState(false)
    const overflowRef = useRef<HTMLButtonElement | null>(null)

    return (
        <header className="top-bar">
            <span className="brand" aria-label="Shooot">SHOOOT</span>
            {desktop ? (
                <>
                    <div className="top-bar__files"><FilePills /></div>
                    <ScoreBadge />
                    <span className="top-bar__actions">
                        <button type="button" onClick={onOpenMatch} className="btn-quiet">Match</button>
                        <ExportPanel />
                    </span>
                </>
            ) : (
                <>
                    <span className="flex-1" />
                    <ScoreBadge compact />
                    <ExportPanel />
                    <button ref={overflowRef} type="button" aria-label="Files and match" aria-expanded={overflow}
                        onClick={() => setOverflow((o) => !o)} className="btn-icon text-[18px]">⋯</button>
                    {overflow && (
                        <FloatingPanel label="Files and match" anchorRef={overflowRef} placement="below" onClose={() => setOverflow(false)}>
                            <section className="export-section">
                                <h3 className="export-section__title">Files</h3>
                                <FilePills />
                            </section>
                            <section className="export-section">
                                <h3 className="export-section__title">Teams and kick-off</h3>
                                <button type="button" onClick={() => { setOverflow(false); onOpenMatch() }} className="btn-quiet">Match setup</button>
                            </section>
                        </FloatingPanel>
                    )}
                </>
            )}
        </header>
    )
}
