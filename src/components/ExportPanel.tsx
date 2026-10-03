import { useRef, useState, type ReactNode } from 'react'
import { ChaptersCopy } from './ChaptersCopy'
import { FloatingPanel } from './FloatingPanel'
import { PreviewControls } from './PreviewControls'
import { ProjectIO } from './ProjectIO'
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

/** The one place output happens: in-player preview, rendered reel, chapters and the project file. */
export function ExportPanel() {
    const [open, setOpen] = useState(false)
    const anchorRef = useRef<HTMLButtonElement | null>(null)

    return (
        <>
            <button ref={anchorRef} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} className="btn-primary">
                Export
            </button>
            {open && (
                <FloatingPanel label="Export" anchorRef={anchorRef} placement="below" onClose={() => setOpen(false)}>
                    <Section title="Preview" hint="in the player, clip by clip">
                        <PreviewControls onStart={() => setOpen(false)} />
                    </Section>
                    <Section title="Render" hint="one MP4 reel">
                        <RenderHighlights />
                    </Section>
                    <Section title="Chapters">
                        <ChaptersCopy />
                    </Section>
                    <Section title="Project">
                        <ProjectIO />
                    </Section>
                </FloatingPanel>
            )}
        </>
    )
}
