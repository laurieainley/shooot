import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useAppState } from '../state'
import { DescriptionCopy } from './DescriptionCopy'
import { FloatingPanel } from './FloatingPanel'
import { FullMatchExport } from './FullMatchExport'
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

const TABS = [
    { id: 'highlights', label: 'Export highlights' },
    { id: 'fullMatch', label: 'Export full match' },
] as const

/** The one place output happens: the highlights reel (preview, graphics, render) or the full match, and their YouTube text. */
export function ExportPanel() {
    const open = useAppState((s) => s.panel === 'export')
    const tab = useAppState((s) => s.exportTab)
    const setOpen = (next: boolean): void => { const st = useAppState.getState(); if (next) st.openPanel('export'); else st.closePanel() }
    const anchorRef = useRef<HTMLButtonElement | null>(null)
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

    const onTabKey = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const i = TABS.findIndex((t) => t.id === tab)
        const next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
        useAppState.getState().setExportTab(TABS[next].id)
        tabRefs.current[next]?.focus()
    }

    return (
        <>
            <button ref={anchorRef} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} className="btn-primary">
                Export
            </button>
            {open && (
                <FloatingPanel label="Export" anchorRef={anchorRef} placement="below" className="floating--export" onClose={() => setOpen(false)}>
                    <div role="tablist" aria-label="Export" className="export-tabs" onKeyDown={onTabKey}>
                        {TABS.map((t, i) => (
                            <button key={t.id} ref={(el) => { tabRefs.current[i] = el }} type="button" role="tab" id={`export-tab-${t.id}`}
                                aria-selected={tab === t.id} aria-controls={`export-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
                                className="export-tab" onClick={() => useAppState.getState().setExportTab(t.id)}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {tab === 'highlights' ? (
                        <div role="tabpanel" id="export-panel-highlights" aria-labelledby="export-tab-highlights">
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
                        </div>
                    ) : (
                        <div role="tabpanel" id="export-panel-fullMatch" aria-labelledby="export-tab-fullMatch">
                            <Section title="Full match" hint="kick-off to final whistle, one MP4">
                                <FullMatchExport />
                            </Section>
                            <Section title="YouTube" hint="description with chapters from kick-off">
                                <DescriptionCopy kind="fullMatch" />
                            </Section>
                        </div>
                    )}
                </FloatingPanel>
            )}
        </>
    )
}
