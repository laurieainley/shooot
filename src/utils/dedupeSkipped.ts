export interface SkippedItem {
    label: string
    reason: string
}

/** Drops repeats of the same label + reason (a graphic that failed on several clips is listed once). */
export function dedupeSkipped(skipped: SkippedItem[]): SkippedItem[] {
    return [...new Map(skipped.map((g) => [`${g.label}|${g.reason}`, g])).values()]
}
