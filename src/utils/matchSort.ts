// Sorting for the Matches list. Pure apart from the remembered choice (localStorage, this device only).
export type SortOrder = 'newest' | 'oldest' | 'edited' | 'least-edited' | 'az' | 'za'

export const SORT_ORDERS: { value: SortOrder; label: string }[] = [
    { value: 'edited', label: 'Last edited' },
    { value: 'least-edited', label: 'Least recently edited' },
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'az', label: 'A–Z' },
    { value: 'za', label: 'Z–A' },
]

export interface SortableMatch { id: string; updatedAt: number; summary: { title: string; dateMs: number } }

const KEY = 'shooot-match-sort'

/** Newest / Oldest use the match date (the recording date, else the creation date), as shown on each row. */
export function sortMatches<T extends SortableMatch>(items: readonly T[], order: SortOrder): T[] {
    const title = (x: T): string => x.summary.title.toLocaleLowerCase('en-GB')
    const cmp: Record<SortOrder, (a: T, b: T) => number> = {
        newest: (a, b) => b.summary.dateMs - a.summary.dateMs,
        oldest: (a, b) => a.summary.dateMs - b.summary.dateMs,
        edited: (a, b) => b.updatedAt - a.updatedAt,
        'least-edited': (a, b) => a.updatedAt - b.updatedAt,
        az: (a, b) => title(a).localeCompare(title(b), 'en-GB'),
        za: (a, b) => title(b).localeCompare(title(a), 'en-GB'),
    }
    return [...items].sort((a, b) => cmp[order](a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function loadSortOrder(): SortOrder {
    try {
        const v = localStorage.getItem(KEY)
        return SORT_ORDERS.some((o) => o.value === v) ? (v as SortOrder) : 'edited'
    } catch { return 'edited' }
}

export function saveSortOrder(o: SortOrder): void {
    try { localStorage.setItem(KEY, o) } catch { /* private mode: the choice just isn't remembered */ }
}
