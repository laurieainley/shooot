import type { SkippedItem } from '../utils/dedupeSkipped'

interface SkippedListProps {
    skipped: SkippedItem[]
    /** Extra context shown after the heading, e.g. when the render happened. */
    note?: string
}

/** The graphics a render went without, and why. */
export function SkippedList({ skipped, note }: SkippedListProps) {
    if (skipped.length === 0) return null
    return (
        <div className="rounded border border-line p-2 text-[12px] text-muted">
            <p className="m-0 mb-1">Rendered without:{note && <span className="font-normal"> ({note})</span>}</p>
            <ul className="m-0 list-disc pl-4">
                {skipped.map((g, i) => <li key={i}>{g.label} — {g.reason}</li>)}
            </ul>
        </div>
    )
}
