import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useAppState } from '../state'
import { useRenderJobs } from '../renderJobs'
import { DescriptionCopy } from './DescriptionCopy'
import { FloatingPanel } from './FloatingPanel'
import { FullMatchExport } from './FullMatchExport'
import { GraphicsSettings } from './GraphicsSettings'
import { PreviewControls } from './PreviewControls'
import { RenderHighlights } from './RenderHighlights'
import { ReelSummary } from './ReelSummary'
import { exportButtonStatus, SHOW_DONE_MS, type ExportButtonStatus } from '../utils/exportButton'

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

/** The render job as the Export button shows it: percentage while running, briefly "ready" / "failed" after (re-evaluated when that window ends). */
function useExportButtonStatus(): ExportButtonStatus {
    const job = useRenderJobs((s) => s.job)
    const [, tick] = useState(0)
    const finishedAt = job?.finishedAt ?? null
    useEffect(() => {
        if (finishedAt === null) return
        const left = finishedAt + SHOW_DONE_MS - Date.now()
        if (left <= 0) return
        const t = setTimeout(() => tick((n) => n + 1), left + 20)
        return () => clearTimeout(t)
    }, [finishedAt])
    return exportButtonStatus(job, Date.now())
}

/** The one place output happens: the highlights reel (preview, graphics, render) or the full match, and their YouTube text. */
export function ExportPanel() {
    const open = useAppState((s) => s.panel === 'export')
    const tab = useAppState((s) => s.exportTab)
    const rendering = useRenderJobs((s) => s.job?.phase === 'running')
    const status = useExportButtonStatus()
    const state = rendering ? (open ? 'rendering-open' : 'rendering') : open ? 'open' : 'idle'
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
            <button ref={anchorRef} type="button" aria-label="Export" aria-expanded={open} aria-haspopup="dialog" data-state={state}
                aria-describedby={status.kind === 'running' ? 'export-btn-status' : undefined}
                title={rendering ? 'A render is running — open to see it' : undefined} onClick={() => setOpen(!open)} className="top-btn top-btn--primary export-btn">
                <span aria-hidden="true">Export</span>
                {status.kind === 'running' && <span className="export-btn__live tc" aria-hidden="true"><i className="export-btn__dot" />{status.percent}%</span>}
                {status.kind === 'done' && <span className="export-btn__live" aria-hidden="true">Ready</span>}
                {status.kind === 'failed' && <span className="export-btn__live msg-warn" aria-hidden="true">Failed</span>}
                {status.kind === 'running' && <span className="export-btn__bar" style={{ width: `${status.percent}%` }} aria-hidden="true" />}
            </button>
            {status.kind === 'running' && <span id="export-btn-status" className="sr-only">Rendering, {status.percent}%</span>}
            {open && (
                <FloatingPanel label="Export" anchorRef={anchorRef} placement="below" variant="drawer" className="floating--export" onClose={() => setOpen(false)}>
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
                            <Section title="Reel" hint="what the render will contain">
                                <ReelSummary />
                                <PreviewControls onStart={() => setOpen(false)} />
                            </Section>
                            <Section title="Graphics" hint="drawn into the rendered reel">
                                <GraphicsSettings />
                            </Section>
                            <Section title="Render" hint="one MP4 reel">
                                <RenderHighlights />
                            </Section>
                            <Section title="Share" hint="YouTube description with chapters">
                                <DescriptionCopy kind="highlights" />
                            </Section>
                        </div>
                    ) : (
                        <div role="tabpanel" id="export-panel-fullMatch" aria-labelledby="export-tab-fullMatch">
                            <Section title="Full match" hint="kick-off to final whistle, one MP4">
                                <FullMatchExport />
                            </Section>
                            <Section title="Share" hint="YouTube description, chapters from kick-off">
                                <DescriptionCopy kind="fullMatch" />
                            </Section>
                        </div>
                    )}
                </FloatingPanel>
            )}
        </>
    )
}
