import type { ReactNode } from 'react'

interface ExportSectionProps {
    title: string
    hint?: string
    children: ReactNode
}

/** One block of an Export tab: a small-caps title with a one-line hint, then its controls. Both tabs are built from these. */
export function ExportSection({ title, hint, children }: ExportSectionProps) {
    return (
        <section className="export-section">
            <h3 className="export-section__title">{title}{hint && <span className="export-section__hint">{hint}</span>}</h3>
            {children}
        </section>
    )
}
