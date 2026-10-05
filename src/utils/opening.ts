const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** Decimal (Finder-style) size: 512 B, 1.5 KB, 11.9 GB. */
export function formatBytes(bytes: number): string {
    let v = Math.max(0, bytes)
    let u = 0
    while (v >= 1000 && u < UNITS.length - 1) { v /= 1000; u++ }
    return u === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${UNITS[u]}`
}

/** Progress text while a picked file is being probed: "Opening GX010226.MP4 (11.9 GB)…". */
export function openingLabel(name: string, bytes: number, more = 0): string {
    return `Opening ${name} (${formatBytes(bytes)})…${more > 0 ? ` +${more} more` : ''}`
}
