import { useRef, type ReactNode } from 'react'
import { useAppState } from '../state'
import { DescriptionCopy } from './DescriptionCopy'
import { FloatingPanel } from './FloatingPanel'
import { GraphicsSettings } from './GraphicsSettings'
import { PreviewControls } from './PreviewControls'
import { RenderHighlights } from './RenderHighlights'

interface SectionProps {
    title: string
    hint?: string
    children: ReactNode
}

function Section({ title, hint, children }: SectionProps) {
    return (
        <section className="export-section">
            <h3 className="export-section__title">{title}{hint && <span className="export-section__hint">{hint}</span>}</h3>
            {children}
        </section>
    )
}

/** The one place output happens: in-player preview, rendered reel and chapters. */
export function ExportPanel() {
    const open = useAppState((s) => s.panel === 'export')
    const setOpen = (next: boolean): void => { const st = useAppState.getState(); if (next) st.openPanel('export'); else st.closePanel() }
    const anchorRef = useRef<HTMLButtonElement | null>(null)

    return (
        <>
            <button ref={anchorRef} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} className="btn-primary">
                Export
            </button>
            {open && (
                <FloatingPanel label="Export" anchorRef={anchorRef} placement="below" onClose={() => setOpen(false)}>
                    <Section title="Preview" hint="in the player, clip by clip">
                        <PreviewControls onStart={() => setOpen(false)} />
                    </Section>
                    <Section title="Graphics" hint="drawn into the rendered reel">
                        <GraphicsSettings />
                    </Section>
                    <Section title="Render" hint="one MP4 reel">
                        <RenderHighlights />
                    </Section>
                    <Section title="YouTube" hint="description with chapters">
                        <DescriptionCopy kind="highlights" />
                    </Section>
                </FloatingPanel>
            )}
        </>
    )
}
