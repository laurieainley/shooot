import { useId, useState, type ReactNode } from 'react'

interface ExportDisclosureProps {
    /** Storage key suffix: which section this is. */
    id: string
    title: string
    /** One line of what is set, shown while closed (and open). */
    summary: string
    children: ReactNode
}

const key = (id: string): string => `shooot-export-open-${id}`

function readOpen(id: string): boolean {
    try { return localStorage.getItem(key(id)) === '1' } catch { return false }
}

function writeOpen(id: string, open: boolean): void {
    try { localStorage.setItem(key(id), open ? '1' : '0') } catch { /* private mode: it just will not be remembered */ }
}

/** A collapsed Export setting: a full-width row (title, one-line summary, chevron) that opens its controls. Open or closed is remembered. */
export function ExportDisclosure({ id, title, summary, children }: ExportDisclosureProps) {
    const [open, setOpen] = useState(() => readOpen(id))
    const panelId = useId()
    const toggle = (): void => { const next = !open; setOpen(next); writeOpen(id, next) }
    return (
        <section className="export-disclosure">
            <button type="button" className="export-disclosure__row" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
                <span className="export-disclosure__text">
                    <b className="export-disclosure__title">{title}</b>
                    <span className="export-disclosure__summary">{summary}</span>
                </span>
                <span className="export-disclosure__chevron" aria-hidden="true" />
            </button>
            {open && <div id={panelId} className="export-disclosure__body">{children}</div>}
        </section>
    )
}
